/**
 * Shared venue types (PLAN.md §5, venue adapter).
 *
 * This module is pure config + types. It holds no keys, performs no I/O, and
 * builds no calldata. Execution wiring (executor, RPC, signing) is a later
 * milestone; this package only quotes, simulates, and reads positions
 * deterministically so proposals can be policy-checked before signature.
 *
 * Money rule (PLAN.md §4): atomic bigint in memory, decimal strings on the
 * wire. No `number` ever holds a currency value.
 */

/** Concentrated-liquidity implementations are distinct. Never treat one as another. */
export const VENUE_KINDS = ['uniswap-v3', 'uniswap-v4', 'aerodrome', 'swap-router'] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

/**
 * Venue-level actions. The first four mirror the policy ACTION_TYPES (ENTER /
 * RANGE_CHANGE / COLLECT / EXIT). SWAP exists for the Phase-2 Arc bot
 * (swap, ape, broader DeFi) and is NOT authorized by the current MVP policy —
 * it requires a policy extension plus fresh user approval.
 */
export const VENUE_ACTIONS = ['ENTER', 'RANGE_CHANGE', 'COLLECT', 'EXIT', 'SWAP'] as const;
export type VenueAction = (typeof VENUE_ACTIONS)[number];

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  /** Fee-on-transfer / rebasing / upgradeable tokens are deferred (PLAN.md §6). */
  isFeeOnTransfer: boolean;
  isRebasing: boolean;
}

export interface PoolInfo {
  poolAddress: string;
  venueKind: VenueKind;
  chainId: number;
  token0: TokenInfo;
  token1: TokenInfo;
  /** Uniswap-style fee tier in bps: 30 = 0.30% (ACTFUN V3 graduation tier). */
  feeBps: number;
  /** True for ACTFUN-graduated V3 full-range pools. */
  isFullRange: boolean;
  /** True when the LP position is creator-locked (fees do NOT belong to new LPs). */
  isCreatorLocked: boolean;
  /** True when anyone can mint a public position (required for FLOAT). */
  allowsPublicMint: boolean;
  tickLower: number | null;
  tickUpper: number | null;
}

export interface PoolSnapshot {
  pool: string;
  venueKind: VenueKind;
  chainId: number;
  blockNumber: number;
  timestampSeconds: number;
  liquidityAtomic: bigint;
  reserve0Atomic: bigint;
  reserve1Atomic: bigint;
  /** Observed trading volume over the sample window, in USDC atomic (6dp). */
  volumeWindowUsdcAtomic: bigint;
  /** Observed fees over the sample window, in USDC atomic (6dp). */
  feesWindowUsdcAtomic: bigint;
  sampleWindowSeconds: number;
  /** Age of the underlying data at quote time. Stale data fails closed. */
  dataAgeSeconds: number;
}

export interface QuoteRequest {
  action: VenueAction;
  pool: PoolInfo;
  /** Desired input size in USDC atomic (6dp). 0n for pure COLLECT reads. */
  amountUsdcAtomic: bigint;
  slippageBps: number;
  priceImpactBps: number;
  /** Estimated gas/network cost in USDC atomic (6dp) for cost-aware HOLD logic. */
  gasUsdcAtomic: bigint;
  /** Estimated swap cost (if entry requires a swap leg), USDC atomic. */
  swapCostUsdcAtomic: bigint;
  quoteAgeSeconds: number;
  dataAgeSeconds: number;
  /** Unix seconds after which the quote must be discarded. */
  expiresAtSeconds: number;
  nowSeconds: number;
}

export interface Quote {
  action: VenueAction;
  pool: string;
  venueKind: VenueKind;
  chainId: number;
  amountUsdcAtomic: bigint;
  /** Minimum received after slippage, USDC atomic. */
  minReceivedUsdcAtomic: bigint;
  gasUsdcAtomic: bigint;
  swapCostUsdcAtomic: bigint;
  slippageBps: number;
  priceImpactBps: number;
  quoteAgeSeconds: number;
  dataAgeSeconds: number;
  expiresAtSeconds: number;
  /** Pessimistic fee estimate over the modeled horizon, USDC atomic. */
  pessimisticFeesUsdcAtomic: bigint;
}

export interface Simulation {
  quote: Quote;
  /** PROCEED only when net-of-costs is positive after buffers; else HOLD. */
  decision: 'PROCEED' | 'HOLD';
  holdReason: string | null;
  netAfterCostsUsdcAtomic: bigint;
  /** Human-readable worst-case scenarios (labeled simulations, not forecasts). */
  scenarios: string[];
}

export interface PositionSummary {
  pool: string;
  venueKind: VenueKind;
  owner: string;
  liquidityAtomic: bigint;
  token0AmountAtomic: bigint;
  token1AmountAtomic: bigint;
  uncollectedFeesUsdcAtomic: bigint;
  inRange: boolean | null;
}

export interface CompatibilityResult {
  ok: boolean;
  reasons: string[];
  codes: string[];
}

export interface Violation {
  code: string;
  message: string;
}

export interface Result {
  ok: boolean;
  violations: Violation[];
}
