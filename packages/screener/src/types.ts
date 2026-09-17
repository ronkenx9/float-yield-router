/**
 * Screener types.
 *
 * A screen filters OBSERVED tokens by caller-supplied parameters and ranks
 * the survivors by one transparent key. It is never a buy recommendation:
 * every row carries its evidence (numbers + data age + flags) so the user —
 * or a downstream swap proposal — can judge it. Stale metrics exclude the
 * token; they are never treated as zero.
 *
 * Money rule: bigint atomic (USDC 6dp) in memory. No float holds money.
 */

export interface TokenRecord {
  address: string;
  symbol: string;
  decimals: number;
  deployer: string;
  deployedAtSeconds: number;
  poolAddress: string;
  venueKind: string;
  /** Deferred mechanics — screened out, never silently included. */
  isFeeOnTransfer: boolean;
  isRebasing: boolean;
  isCreatorLocked: boolean;
}

export interface TokenMetrics {
  tokenAddress: string;
  /** Observed liquidity depth, USDC atomic. */
  liquidityUsdcAtomic: bigint;
  /** Observed trading volume over the sample window, USDC atomic. */
  volumeWindowUsdcAtomic: bigint;
  /** Observed fees over the sample window, USDC atomic. */
  feesWindowUsdcAtomic: bigint;
  holderCount: number;
  sampleWindowSeconds: number;
  /** Age of these metrics. Older than maxDataAgeSeconds excludes the token. */
  dataAgeSeconds: number;
}

export type SortKey = 'volume' | 'liquidity' | 'fees' | 'newest';

export interface ScreenParams {
  /** Minimum pool age in seconds (null = no constraint). */
  minAgeSeconds: number | null;
  maxAgeSeconds: number | null;
  minLiquidityUsdcAtomic: bigint;
  minVolumeUsdcAtomic: bigint;
  minHolders: number;
  maxDataAgeSeconds: number;
  sortBy: SortKey;
  topN: number;
}

export interface ScreenedRow {
  token: TokenRecord;
  metrics: TokenMetrics;
  ageSeconds: number;
  riskFlags: string[];
}

export interface ScreenResult {
  rows: ScreenedRow[];
  /** Tokens seen but excluded, with the reason each was dropped. */
  excluded: Array<{ address: string; symbol: string; reason: string }>;
  scannedAtSeconds: number;
}
