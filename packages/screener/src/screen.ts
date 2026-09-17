/**
 * Deterministic screen: filter → flag → rank → top-N. Pure.
 */

import type {
  ScreenParams,
  ScreenResult,
  ScreenedRow,
  SortKey,
  TokenMetrics,
  TokenRecord,
} from './types.ts';

/** Draft defaults for chat parsing (labeled in replies, not validated optima). */
export const SCREEN_DEFAULTS = {
  minLiquidityUsdcAtomic: 10_000_000n, // $10
  minVolumeUsdcAtomic: 0n,
  minHolders: 0,
  minAgeSeconds: null as number | null,
  maxAgeSeconds: null as number | null,
  maxDataAgeSeconds: 300,
  sortBy: 'volume' as SortKey,
  topN: 5,
} as const;

function isAddr(a: string): boolean {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

function sortValue(row: ScreenedRow, key: SortKey): bigint {
  switch (key) {
    case 'volume':
      return row.metrics.volumeWindowUsdcAtomic;
    case 'liquidity':
      return row.metrics.liquidityUsdcAtomic;
    case 'fees':
      return row.metrics.feesWindowUsdcAtomic;
    case 'newest':
      return BigInt(row.token.deployedAtSeconds);
  }
}

export function screenTokens(
  tokens: TokenRecord[],
  metricsByToken: Map<string, TokenMetrics>,
  params: ScreenParams,
  nowSeconds: number,
): ScreenResult {
  const rows: ScreenedRow[] = [];
  const excluded: ScreenResult['excluded'] = [];

  if (!Number.isInteger(params.topN) || params.topN <= 0 || params.topN > 50) {
    throw new Error('screenTokens: topN must be an integer in [1, 50]');
  }
  if (params.minLiquidityUsdcAtomic < 0n || params.minVolumeUsdcAtomic < 0n) {
    throw new Error('screenTokens: minimums must be >= 0');
  }

  for (const t of tokens) {
    const drop = (reason: string) => excluded.push({ address: t.address, symbol: t.symbol, reason });
    if (!isAddr(t.address)) {
      drop('invalid token address');
      continue;
    }
    if (t.isFeeOnTransfer || t.isRebasing) {
      drop('deferred token mechanics (fee-on-transfer/rebasing)');
      continue;
    }
    if (t.isCreatorLocked) {
      drop('creator-locked liquidity (fees do not belong to new holders/LPs)');
      continue;
    }
    const age = nowSeconds - t.deployedAtSeconds;
    if (!Number.isInteger(t.deployedAtSeconds) || age < 0) {
      drop('unknown or future deploy time');
      continue;
    }
    if (params.minAgeSeconds !== null && age < params.minAgeSeconds) {
      drop(`younger than min age (${age}s < ${params.minAgeSeconds}s)`);
      continue;
    }
    if (params.maxAgeSeconds !== null && age > params.maxAgeSeconds) {
      drop(`older than max age (${age}s > ${params.maxAgeSeconds}s)`);
      continue;
    }
    const m = metricsByToken.get(t.address.toLowerCase());
    if (!m) {
      drop('no metrics observed');
      continue;
    }
    if (m.dataAgeSeconds < 0 || m.dataAgeSeconds > params.maxDataAgeSeconds) {
      drop(`stale metrics (${m.dataAgeSeconds}s > max ${params.maxDataAgeSeconds}s)`);
      continue;
    }
    if (m.liquidityUsdcAtomic < params.minLiquidityUsdcAtomic) {
      drop('below min liquidity');
      continue;
    }
    if (m.volumeWindowUsdcAtomic < params.minVolumeUsdcAtomic) {
      drop('below min volume');
      continue;
    }
    if (!Number.isInteger(m.holderCount) || m.holderCount < params.minHolders) {
      drop('below min holders');
      continue;
    }

    const riskFlags: string[] = [];
    if (age < 24 * 3600) riskFlags.push('launched-under-24h');
    if (m.holderCount < 50) riskFlags.push('few-holders');
    if (m.volumeWindowUsdcAtomic > 0n && m.liquidityUsdcAtomic > 0n) {
      // Thin book vs flow: volume dwarfing depth can mean exits fail.
      if (m.volumeWindowUsdcAtomic > m.liquidityUsdcAtomic * 10n) {
        riskFlags.push('volume-dwarfs-liquidity');
      }
    } else if (m.liquidityUsdcAtomic <= 0n) {
      riskFlags.push('no-depth');
    }
    rows.push({ token: t, metrics: m, ageSeconds: age, riskFlags });
  }

  rows.sort((a, b) => {
    const va = sortValue(a, params.sortBy);
    const vb = sortValue(b, params.sortBy);
    if (vb > va) return 1;
    if (vb < va) return -1;
    return a.token.symbol.localeCompare(b.token.symbol);
  });

  return { rows: rows.slice(0, params.topN), excluded, scannedAtSeconds: nowSeconds };
}
