/**
 * Deterministic pool eligibility screening (PLAN.md §4 modes, §10 M0 gate).
 *
 * Answers: is this pool a candidate the strategy may even consider? HOLD /
 * ineligible is a first-class outcome. This module performs no I/O and makes
 * no profit claims — it only enforces minimum evidence bars before a quote.
 */

import type { PoolInfo, PoolSnapshot } from './types.ts';

export interface EligibilityInput {
  pool: PoolInfo;
  snapshot: PoolSnapshot;
  nowSeconds: number;
  /** Minimum sample window (PLAN.md M0 suggests >= 14 days of history). */
  minSampleWindowSeconds: number;
  /** Minimum observed volume over the window, USDC atomic. */
  minVolumeUsdcAtomic: bigint;
  /** Minimum liquidity depth, atomic (pool's own units; compared as bigint). */
  minLiquidityAtomic: bigint;
  /** Minimum pool age in seconds (derived by caller from deployment time). */
  minPoolAgeSeconds: number;
  /** Actual pool age in seconds. Unknown age (null) fails closed. */
  poolAgeSeconds: number | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  riskFlags: string[];
}

function addrOk(a: string): boolean {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

/** Screen a pool + snapshot against minimum evidence bars. Pure. */
export function screenPool(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const { pool, snapshot } = input;

  // ---- structural / allowlist-shape gates ----
  if (!addrOk(pool.poolAddress)) reasons.push('pool address invalid');
  if (pool.poolAddress.trim().toLowerCase() !== snapshot.pool.trim().toLowerCase()) {
    reasons.push('snapshot pool mismatch');
  }
  if (pool.venueKind !== snapshot.venueKind) reasons.push('snapshot venue mismatch');
  if (pool.chainId !== snapshot.chainId) reasons.push('snapshot chain mismatch');

  // ---- venue compatibility (PLAN.md §6: v3/v4/Aerodrome are distinct) ----
  if (pool.venueKind !== 'uniswap-v3') {
    reasons.push(`venue ${pool.venueKind} has no verified FLOAT adapter in this release`);
  }
  if (pool.isCreatorLocked) {
    reasons.push('creator-locked LP: fees belong to creator/platform, not new LPs');
    riskFlags.push('creator-locked-liquidity');
  }
  if (!pool.allowsPublicMint) {
    reasons.push('no public position creation: FLOAT cannot mint here');
  }

  // ---- deferred token mechanics (PLAN.md §6) ----
  if (pool.token0.isFeeOnTransfer || pool.token1.isFeeOnTransfer) {
    reasons.push('fee-on-transfer token deferred');
    riskFlags.push('fee-on-transfer');
  }
  if (pool.token0.isRebasing || pool.token1.isRebasing) {
    reasons.push('rebasing token deferred');
    riskFlags.push('rebasing');
  }

  // ---- evidence bars (M0: usable history, sustained organic activity) ----
  if (snapshot.sampleWindowSeconds < input.minSampleWindowSeconds) {
    reasons.push(
      `insufficient history: ${snapshot.sampleWindowSeconds}s < required ${input.minSampleWindowSeconds}s`,
    );
  }
  if (snapshot.volumeWindowUsdcAtomic < input.minVolumeUsdcAtomic) {
    reasons.push('insufficient sustained volume over the sample window');
  }
  if (snapshot.liquidityAtomic < input.minLiquidityAtomic) {
    reasons.push('insufficient liquidity depth');
  }
  if (input.poolAgeSeconds === null) {
    reasons.push('unknown pool age: valuation unavailable, fails closed');
  } else if (input.poolAgeSeconds < input.minPoolAgeSeconds) {
    reasons.push('pool too new: opening-hour fees must not be extrapolated');
    riskFlags.push('new-pool');
  }

  // ---- staleness fails closed ----
  if (snapshot.dataAgeSeconds < 0) reasons.push('negative data age');
  // (max age enforcement lives in the policy engine; here we flag absurd ages)
  if (snapshot.dataAgeSeconds > 86_400) riskFlags.push('stale-snapshot');

  // ---- concentration / range notes (risk flags, not auto-reject) ----
  if (!pool.isFullRange) riskFlags.push('concentrated-range');
  if (snapshot.feesWindowUsdcAtomic < 0n) reasons.push('negative fee observation');

  return { eligible: reasons.length === 0, reasons, riskFlags };
}

/** Default evidence bars for tests and early screening (not production limits). */
export const DEFAULT_SCREEN = {
  /** 14 days in seconds (PLAN.md M0 measurement window). */
  minSampleWindowSeconds: 14 * 24 * 3600,
} as const;
