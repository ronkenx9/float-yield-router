/**
 * Uniswap V3 adapter — the first (and currently only) verified venue shape.
 *
 * Scope: offline quote validation + pessimistic simulation for concentrated
 * LP on an Arc chain. No RPC, no signing, no calldata construction. Real
 * on-chain liquidity math (quoter / position manager) happens at execution
 * time behind the executor; this module never fabricates fills.
 *
 * PLAN.md §6: Uniswap V3 is the first adapter CANDIDATE, not a promised Arc
 * deployment. Execution additionally requires the Arc readiness gate
 * (official chainId, RPC, verified bytecode) and per-pool verification
 * (public mint + real fee ownership).
 */

import type {
  CompatibilityResult,
  PoolInfo,
  PositionSummary,
  Quote,
  QuoteRequest,
  Simulation,
  VenueAction,
} from './types.ts';
import type { SimulateOpts, VenueAdapter } from './adapter.ts';
import {
  BPS_DENOMINATOR,
  isValidBps,
  minReceivedAfterSlippage,
  netAfterCosts,
  pessimisticFeeEstimate,
} from './math.ts';

/** Arc Testnet chain id (mirrors @floatrouter/policy ARC_TESTNET). */
export const SUPPORTED_CHAIN_IDS: readonly number[] = [5042002];

/**
 * Reference V3 NonfungiblePositionManager selectors.
 * Mint (0x88316456) is well-known and already used in policy fixtures.
 * The rest are listed for allowlist shape-checking ONLY — every selector must
 * still be verified against the deployed bytecode before any execution code
 * uses it. This adapter never builds calldata.
 */
export const V3_REFERENCE_SELECTORS = {
  mint: '0x88316456',
  increaseLiquidity: '0x219f5d17',
  decreaseLiquidity: '0x0c49ccbe',
  collect: '0xfc6f7865',
} as const;

const V3_ACTIONS: readonly VenueAction[] = ['ENTER', 'RANGE_CHANGE', 'COLLECT', 'EXIT'];

function isAddr(a: string): boolean {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

function isSelector(s: string): boolean {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{8}$/.test(s.trim());
}

export interface UniswapV3AdapterConfig {
  chainId: number;
  venueId?: string;
}

export class UniswapV3Adapter implements VenueAdapter {
  readonly kind = 'uniswap-v3' as const;
  readonly venueId: string;
  readonly chainId: number;

  constructor(config: UniswapV3AdapterConfig) {
    if (!SUPPORTED_CHAIN_IDS.includes(config.chainId)) {
      throw new Error(
        `UniswapV3Adapter: chainId ${config.chainId} is not a supported, verified chain ` +
          `(supported: ${SUPPORTED_CHAIN_IDS.join(', ')}; mainnet intentionally unconfigured)`,
      );
    }
    this.chainId = config.chainId;
    this.venueId = config.venueId ?? `uniswap-v3-${config.chainId}`;
  }

  supportsAction(action: VenueAction): boolean {
    return (V3_ACTIONS as readonly string[]).includes(action);
  }

  checkPoolCompatible(pool: PoolInfo): CompatibilityResult {
    const reasons: string[] = [];
    const codes: string[] = [];
    const reject = (code: string, reason: string) => {
      codes.push(code);
      reasons.push(reason);
    };

    if (pool.venueKind !== 'uniswap-v3') {
      reject('VENUE_MISMATCH', `expected uniswap-v3 pool, got ${pool.venueKind}`);
    }
    if (pool.chainId !== this.chainId) {
      reject('CHAIN_MISMATCH', `pool chain ${pool.chainId} != adapter chain ${this.chainId}`);
    }
    if (!isAddr(pool.poolAddress)) reject('POOL_ADDRESS_INVALID', 'pool address invalid');
    if (!isAddr(pool.token0.address) || !isAddr(pool.token1.address)) {
      reject('TOKEN_ADDRESS_INVALID', 'token address invalid');
    }
    if (!Number.isInteger(pool.feeBps) || pool.feeBps < 0 || pool.feeBps > BPS_DENOMINATOR) {
      reject('FEE_TIER_INVALID', 'feeBps must be an integer in [0, 10000]');
    }
    if (pool.token0.isFeeOnTransfer || pool.token1.isFeeOnTransfer) {
      reject('FEE_ON_TRANSFER_DEFERRED', 'fee-on-transfer tokens are deferred');
    }
    if (pool.token0.isRebasing || pool.token1.isRebasing) {
      reject('REBASING_DEFERRED', 'rebasing tokens are deferred');
    }
    if (pool.isCreatorLocked) {
      reject(
        'CREATOR_LOCKED',
        'creator-locked LP: trading fees split to creator/platform, not to new LPs',
      );
    }
    if (!pool.allowsPublicMint) {
      reject('NO_PUBLIC_MINT', 'pool does not allow public position creation');
    }

    return { ok: codes.length === 0, reasons, codes };
  }

  quote(req: QuoteRequest): Quote {
    if (!this.supportsAction(req.action)) {
      throw new Error(
        `UniswapV3Adapter: action ${req.action} unsupported (v3 LP only; SWAP belongs to a swap-router adapter)`,
      );
    }
    // ---- fail-closed input validation ----
    if (req.pool.venueKind !== 'uniswap-v3') throw new Error('quote: pool venueKind must be uniswap-v3');
    if (req.pool.chainId !== this.chainId) throw new Error('quote: pool chain mismatch');
    if (!isValidBps(req.slippageBps)) throw new Error(`quote: bad slippageBps ${req.slippageBps}`);
    if (!isValidBps(req.priceImpactBps)) throw new Error(`quote: bad priceImpactBps ${req.priceImpactBps}`);
    if (req.amountUsdcAtomic < 0n) throw new Error('quote: amount must be >= 0');
    if (req.action === 'ENTER' && req.amountUsdcAtomic <= 0n) {
      throw new Error('quote: ENTER requires amountUsdcAtomic > 0');
    }
    if (req.gasUsdcAtomic < 0n || req.swapCostUsdcAtomic < 0n) {
      throw new Error('quote: costs must be >= 0');
    }
    if (req.quoteAgeSeconds < 0 || req.dataAgeSeconds < 0) {
      throw new Error('quote: negative age fails closed');
    }
    if (req.expiresAtSeconds <= req.nowSeconds) throw new Error('quote: already expired');

    const compat = this.checkPoolCompatible(req.pool);
    if (!compat.ok) {
      throw new Error(`quote: incompatible pool (${compat.codes.join(', ')})`);
    }

    const minReceivedUsdcAtomic = minReceivedAfterSlippage(req.amountUsdcAtomic, req.slippageBps);

    return {
      action: req.action,
      pool: req.pool.poolAddress,
      venueKind: 'uniswap-v3',
      chainId: this.chainId,
      amountUsdcAtomic: req.amountUsdcAtomic,
      minReceivedUsdcAtomic,
      gasUsdcAtomic: req.gasUsdcAtomic,
      swapCostUsdcAtomic: req.swapCostUsdcAtomic,
      slippageBps: req.slippageBps,
      priceImpactBps: req.priceImpactBps,
      quoteAgeSeconds: req.quoteAgeSeconds,
      dataAgeSeconds: req.dataAgeSeconds,
      expiresAtSeconds: req.expiresAtSeconds,
      // Pessimistic fees are set at simulate() time once observed fees are
      // known; the raw quote carries zero so nothing looks profitable yet.
      pessimisticFeesUsdcAtomic: 0n,
    };
  }

  simulate(quote: Quote, opts: SimulateOpts = {}): Simulation {
    const haircut = opts.feeHaircutBps ?? 2000; // default: model fees 20% light
    if (!isValidBps(haircut)) throw new Error(`simulate: bad feeHaircutBps ${haircut}`);
    const observed = opts.observedFeesUsdcAtomic ?? 0n;
    if (observed < 0n) throw new Error('simulate: observed fees must be >= 0');
    const extra = opts.extraBufferUsdcAtomic ?? 0n;

    const pessimistic = pessimisticFeeEstimate(observed, haircut);
    const net = netAfterCosts(pessimistic, quote.gasUsdcAtomic, quote.swapCostUsdcAtomic, extra);
    const withFees: Quote = { ...quote, pessimisticFeesUsdcAtomic: pessimistic };

    const scenarios = [
      'sideways: fees arrive near the pessimistic estimate; net = fees - gas - swap costs',
      'token falls 70%: inventory loss can exceed all fees earned; exit liquidity not guaranteed',
      'out of range: position earns nothing until rebalanced; rebalance costs may exceed near-term fees',
    ];

    if (quote.action === 'COLLECT' && quote.amountUsdcAtomic === 0n && pessimistic <= quote.gasUsdcAtomic) {
      return {
        quote: withFees,
        decision: 'HOLD',
        holdReason: 'collect gas exceeds pessimistic fees; leaving fees uncollected',
        netAfterCostsUsdcAtomic: net,
        scenarios,
      };
    }

    if (net <= 0n) {
      return {
        quote: withFees,
        decision: 'HOLD',
        holdReason: 'pessimistic fees do not cover gas + swap costs after buffer; no change proposed',
        netAfterCostsUsdcAtomic: net,
        scenarios,
      };
    }

    return {
      quote: withFees,
      decision: 'PROCEED',
      holdReason: null,
      netAfterCostsUsdcAtomic: net,
      scenarios,
    };
  }

  toPolicyActionShape(
    quote: Quote,
    ctx: { contract: string; selector: string; pool: string; tokensTouched: string[] },
  ) {
    if (quote.action === 'SWAP') throw new Error('toPolicyActionShape: SWAP is not an LP action');
    if (!isAddr(ctx.contract)) throw new Error('toPolicyActionShape: contract address invalid');
    if (!isSelector(ctx.selector)) throw new Error('toPolicyActionShape: selector must be 4-byte hex');
    if (!isAddr(ctx.pool)) throw new Error('toPolicyActionShape: pool address invalid');
    return {
      type: quote.action as 'ENTER' | 'RANGE_CHANGE' | 'COLLECT' | 'EXIT',
      pool: ctx.pool,
      contract: ctx.contract,
      selector: ctx.selector,
      tokensTouched: ctx.tokensTouched,
      notionalAtomic: quote.amountUsdcAtomic,
      slippageBps: quote.slippageBps,
      priceImpactBps: quote.priceImpactBps,
      gasAtomic: quote.gasUsdcAtomic,
      quoteAgeSeconds: quote.quoteAgeSeconds,
      dataAgeSeconds: quote.dataAgeSeconds,
    };
  }

  summarizePosition(pos: PositionSummary): PositionSummary {
    if (pos.venueKind !== 'uniswap-v3') throw new Error('summarizePosition: venueKind must be uniswap-v3');
    if (!isAddr(pos.pool) || !isAddr(pos.owner)) throw new Error('summarizePosition: address invalid');
    if (pos.liquidityAtomic < 0n) throw new Error('summarizePosition: liquidity must be >= 0');
    return pos;
  }
}
