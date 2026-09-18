/**
 * Swap-router adapter — the Phase-2 trading venue shape.
 *
 * Deliberately NOT a VenueAdapter: swaps have no pool, and v3 / v4 / swap
 * are distinct implementations (PLAN.md §5–§6). It shares the house rules —
 * offline quotes, pessimistic simulation with HOLD first-class, bigint money,
 * and a policy-gate action shape — but nothing else.
 *
 * Price honesty: the adapter NEVER invents a price. `quotedOutAtomic` arrives
 * from an injected quote source (live: on-chain quoter at execution time;
 * tests: fixed fixture). The adapter validates bounds, applies slippage, and
 * simulates net-of-costs. If the market moves past the quoted bounds, the
 * approval no longer covers the trade and a new quote is required.
 */

import type { CompatibilityResult } from './types.ts';
import {
  isValidBps,
  minReceivedAfterSlippage,
} from './math.ts';

/** Arc Testnet chain id (mirrors @floatrouter/policy ARC_TESTNET). */
export const SWAP_SUPPORTED_CHAIN_IDS: readonly number[] = [5042002];

export interface SwapToken {
  address: string;
  symbol: string;
  decimals: number;
  isFeeOnTransfer: boolean;
  isRebasing: boolean;
}

export interface SwapQuoteRequest {
  chainId: number;
  router: string;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  amountInAtomic: bigint;
  /** Quoted output from the price source (NOT invented here). */
  quotedOutAtomic: bigint;
  slippageBps: number;
  priceImpactBps: number;
  gasUsdcAtomic: bigint;
  quoteAgeSeconds: number;
  dataAgeSeconds: number;
  expiresAtSeconds: number;
  nowSeconds: number;
}

export interface SwapQuote {
  action: 'SWAP';
  venueKind: 'swap-router';
  chainId: number;
  router: string;
  tokenIn: string;
  tokenOut: string;
  amountInAtomic: bigint;
  quotedOutAtomic: bigint;
  /** Minimum output after slippage — the approval binds to this. */
  minOutAtomic: bigint;
  gasUsdcAtomic: bigint;
  slippageBps: number;
  priceImpactBps: number;
  quoteAgeSeconds: number;
  dataAgeSeconds: number;
  expiresAtSeconds: number;
}

export interface SwapSimulation {
  quote: SwapQuote;
  decision: 'PROCEED' | 'HOLD';
  holdReason: string | null;
  /** Pessimistic net output after gas, in output-token atomic units. */
  netOutAtomic: bigint;
  scenarios: string[];
}

function isAddr(a: string): boolean {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

export class SwapRouterAdapter {
  readonly kind = 'swap-router' as const;
  readonly venueId: string;
  readonly chainId: number;

  constructor(config: { chainId: number; venueId?: string }) {
    if (!SWAP_SUPPORTED_CHAIN_IDS.includes(config.chainId)) {
      throw new Error(
        `SwapRouterAdapter: chainId ${config.chainId} is not a supported, verified chain ` +
          `(supported: ${SWAP_SUPPORTED_CHAIN_IDS.join(', ')}; mainnet intentionally unconfigured)`,
      );
    }
    this.chainId = config.chainId;
    this.venueId = config.venueId ?? `swap-router-${config.chainId}`;
  }

  /** This adapter implements SWAP and nothing else (LP actions belong to V3). */
  supportsAction(action: string): boolean {
    return action === 'SWAP';
  }

  checkSwapCompatible(tokenIn: SwapToken, tokenOut: SwapToken, router: string): CompatibilityResult {
    const reasons: string[] = [];
    const codes: string[] = [];
    const reject = (code: string, reason: string) => {
      codes.push(code);
      reasons.push(reason);
    };
    if (!isAddr(tokenIn.address) || !isAddr(tokenOut.address)) {
      reject('TOKEN_ADDRESS_INVALID', 'token address invalid');
    }
    if (isAddr(tokenIn.address) && tokenIn.address.trim().toLowerCase() === tokenOut.address.trim().toLowerCase()) {
      reject('SAME_TOKEN', 'tokenIn and tokenOut are the same token');
    }
    if (!isAddr(router)) reject('ROUTER_ADDRESS_INVALID', 'router address invalid');
    if (tokenIn.isFeeOnTransfer || tokenOut.isFeeOnTransfer) {
      reject('FEE_ON_TRANSFER_DEFERRED', 'fee-on-transfer tokens are deferred');
    }
    if (tokenIn.isRebasing || tokenOut.isRebasing) {
      reject('REBASING_DEFERRED', 'rebasing tokens are deferred');
    }
    return { ok: codes.length === 0, reasons, codes };
  }

  quoteSwap(req: SwapQuoteRequest): SwapQuote {
    if (req.chainId !== this.chainId) throw new Error('quoteSwap: chain mismatch');
    if (!isValidBps(req.slippageBps)) throw new Error(`quoteSwap: bad slippageBps ${req.slippageBps}`);
    if (!isValidBps(req.priceImpactBps)) throw new Error(`quoteSwap: bad priceImpactBps ${req.priceImpactBps}`);
    if (req.amountInAtomic <= 0n) throw new Error('quoteSwap: amountIn must be > 0');
    if (req.quotedOutAtomic <= 0n) throw new Error('quoteSwap: quotedOut must be > 0 (price source gave nothing quotable)');
    if (req.gasUsdcAtomic < 0n) throw new Error('quoteSwap: gas must be >= 0');
    if (req.quoteAgeSeconds < 0 || req.dataAgeSeconds < 0) throw new Error('quoteSwap: negative age fails closed');
    if (req.expiresAtSeconds <= req.nowSeconds) throw new Error('quoteSwap: already expired');
    const compat = this.checkSwapCompatible(req.tokenIn, req.tokenOut, req.router);
    if (!compat.ok) throw new Error(`quoteSwap: incompatible (${compat.codes.join(', ')})`);
    return {
      action: 'SWAP',
      venueKind: 'swap-router',
      chainId: this.chainId,
      router: req.router,
      tokenIn: req.tokenIn.address,
      tokenOut: req.tokenOut.address,
      amountInAtomic: req.amountInAtomic,
      quotedOutAtomic: req.quotedOutAtomic,
      minOutAtomic: minReceivedAfterSlippage(req.quotedOutAtomic, req.slippageBps),
      gasUsdcAtomic: req.gasUsdcAtomic,
      slippageBps: req.slippageBps,
      priceImpactBps: req.priceImpactBps,
      quoteAgeSeconds: req.quoteAgeSeconds,
      dataAgeSeconds: req.dataAgeSeconds,
      expiresAtSeconds: req.expiresAtSeconds,
    };
  }

  /**
   * Cost-aware simulation. Gas is denominated in USDC atomic while output is
   * in token atomic — without a live output-price the adapter cannot net them
   * in one unit, so the HOLD rule is explicit and conservative: proceed only
   * when the caller asserts output value covers gas via `coversGas` (live:
   * derived from the same quoter response; tests: fixture). Never assumed.
   */
  simulateSwap(
    quote: SwapQuote,
    opts: { coversGas?: boolean; extraBufferUsdcAtomic?: bigint } = {},
  ): SwapSimulation {
    const scenarios = [
      'price moves past quoted bounds: approval no longer covers the trade; re-quote required',
      'thin output liquidity: received amount can print below minOut and revert',
      'revert: gas is spent and nothing is received',
    ];
    if (opts.coversGas !== true) {
      return {
        quote,
        decision: 'HOLD',
        holdReason: 'output value vs gas unverified — HOLD until the quoter confirms coverage',
        netOutAtomic: quote.minOutAtomic,
        scenarios,
      };
    }
    return {
      quote,
      decision: 'PROCEED',
      holdReason: null,
      netOutAtomic: quote.minOutAtomic,
      scenarios,
    };
  }

  /**
   * Shape for the policy gate (@floatrouter/policy checkAction with
   * type SWAP). The caller supplies the allowlisted router contract +
   * selector; the adapter never invents them. Gas is policy-checked in
   * USDC atomic as usual.
   *
   * Notional for the position-size cap must be USDC-comparable: pass
   * `notionalUsdcAtomic` (for sells, the quoted USDC value — token atomic
   * units are meaningless against a USDC cap). Defaults to amountInAtomic,
   * which is already USDC for buys.
   */
  toPolicyActionShape(
    quote: SwapQuote,
    ctx: { contract: string; selector: string; gasAtomic: bigint; notionalUsdcAtomic?: bigint },
  ) {
    if (!isAddr(ctx.contract)) throw new Error('toPolicyActionShape: contract address invalid');
    if (!/^0x[0-9a-fA-F]{8}$/.test(ctx.selector.trim())) {
      throw new Error('toPolicyActionShape: selector must be 4-byte hex');
    }
    if (ctx.gasAtomic < 0n) throw new Error('toPolicyActionShape: gas must be >= 0');
    const notional = ctx.notionalUsdcAtomic ?? quote.amountInAtomic;
    if (notional <= 0n) throw new Error('toPolicyActionShape: notional must be > 0');
    return {
      type: 'SWAP' as const,
      pool: quote.router,
      contract: ctx.contract,
      selector: ctx.selector,
      tokensTouched: [quote.tokenIn, quote.tokenOut],
      notionalAtomic: notional,
      slippageBps: quote.slippageBps,
      priceImpactBps: quote.priceImpactBps,
      gasAtomic: ctx.gasAtomic,
      quoteAgeSeconds: quote.quoteAgeSeconds,
      dataAgeSeconds: quote.dataAgeSeconds,
    };
  }
}
