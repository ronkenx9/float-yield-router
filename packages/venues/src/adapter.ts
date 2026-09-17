/**
 * Generic venue-adapter interface (PLAN.md §5).
 *
 * One interface for every venue so Phase 2 (swap / broader Arc DeFi) does not
 * require a rewrite: Uniswap V3 LP is the first implementation, a swap router
 * is the natural second. v3, v4, and Aerodrome are different implementations,
 * never interchangeable names — the interface enforces `venueKind` matching.
 *
 * Adapters are offline and deterministic: they validate, quote, and simulate.
 * They never sign, never touch RPC, and never build raw calldata in this pass.
 */

import type {
  CompatibilityResult,
  PoolInfo,
  PositionSummary,
  Quote,
  QuoteRequest,
  Simulation,
  VenueAction,
  VenueKind,
} from './types.ts';

export interface VenueAdapter {
  readonly kind: VenueKind;
  readonly venueId: string;
  readonly chainId: number;

  /** True when this adapter implements the action (v3 LP rejects SWAP). */
  supportsAction(action: VenueAction): boolean;

  /** Verify a pool can host public FLOAT positions with real fee ownership. */
  checkPoolCompatible(pool: PoolInfo): CompatibilityResult;

  /** Typed quote for a single action. Throws on unsupported action. */
  quote(req: QuoteRequest): Quote;

  /** Cost-aware simulation with HOLD as a first-class outcome. */
  simulate(quote: Quote, opts?: SimulateOpts): Simulation;

  /**
   * Convert a venue quote into the policy-engine action shape
   * (pool / contract / selector / tokens / notionals / ages) so the SAME
   * fail-closed `checkAction` gate from @floatrouter/policy applies unchanged.
   * The caller supplies the allowlisted contract + selector; the adapter never
   * invents them.
   */
  toPolicyActionShape(
    quote: Quote,
    ctx: { contract: string; selector: string; pool: string; tokensTouched: string[] },
  ): {
    type: 'ENTER' | 'RANGE_CHANGE' | 'COLLECT' | 'EXIT';
    pool: string;
    contract: string;
    selector: string;
    tokensTouched: string[];
    notionalAtomic: bigint;
    slippageBps: number;
    priceImpactBps: number;
    gasAtomic: bigint;
    quoteAgeSeconds: number;
    dataAgeSeconds: number;
  };

  /** Summarize a position read (pure shape validation; chain reads come later). */
  summarizePosition(pos: PositionSummary): PositionSummary;
}

export interface SimulateOpts {
  /** Haircut applied to observed fees (bps). Default models lighter-than-observed fees. */
  feeHaircutBps?: number;
  /** Extra safety buffer beyond gas + swap costs, USDC atomic. */
  extraBufferUsdcAtomic?: bigint;
  /** Observed fees over the modeled horizon, USDC atomic. */
  observedFeesUsdcAtomic?: bigint;
}

export const ADAPTER_INTERFACE_VERSION = 'venues/v1' as const;
