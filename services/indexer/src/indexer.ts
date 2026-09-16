/**
 * Market indexer core (PLAN.md §5).
 *
 * Deterministic, offline, dependency-free. Ingests pool events/state with
 * block cursors + timestamps, deduplicates, reconciles, and flags stale data
 * as unavailable for execution. Chain reads (RPC) plug in later behind the
 * same cursor interface; this module never performs I/O.
 */

export const EVENT_KINDS = ['mint', 'burn', 'collect', 'swap'] as const;
export type PoolEventKind = (typeof EVENT_KINDS)[number];

export interface PoolEvent {
  /** Stable dedupe key (e.g. txHash + logIndex). */
  key: string;
  pool: string;
  kind: PoolEventKind;
  blockNumber: number;
  timestampSeconds: number;
  liquidityDeltaAtomic: bigint;
  volumeUsdcAtomic: bigint;
  feesUsdcAtomic: bigint;
}

export interface Cursor {
  pool: string;
  lastBlock: number;
  lastTimestampSeconds: number;
  eventCount: number;
}

export interface Snapshot {
  pool: string;
  chainId: number;
  blockNumber: number;
  timestampSeconds: number;
  liquidityAtomic: bigint;
  volumeWindowUsdcAtomic: bigint;
  feesWindowUsdcAtomic: bigint;
  sampleWindowSeconds: number;
  dataAgeSeconds: number;
  /** True when the snapshot must not back execution (fail closed). */
  stale: boolean;
}

export interface IndexerState {
  cursors: Map<string, Cursor>;
  events: Map<string, PoolEvent>;
  poolChain: Map<string, number>;
}

export function createIndexer(): IndexerState {
  return { cursors: new Map(), events: new Map(), poolChain: new Map() };
}

function normPool(p: string): string {
  return p.trim().toLowerCase();
}

/**
 * Ingest a batch of events. Deduplicates by key, ignores regressed blocks
 * for cursor advancement (cursor is monotonic), and records chain per pool.
 * Out-of-order delivery within the batch is sorted before applying.
 */
export function ingestEvents(
  state: IndexerState,
  chainId: number,
  batch: PoolEvent[],
): { ingested: number; duplicates: number } {
  const sorted = [...batch].sort(
    (a, b) => a.blockNumber - b.blockNumber || a.timestampSeconds - b.timestampSeconds,
  );
  let ingested = 0;
  let duplicates = 0;
  for (const e of sorted) {
    if (!Number.isInteger(e.blockNumber) || e.blockNumber < 0) throw new Error(`ingest: bad block ${e.key}`);
    if (!Number.isInteger(e.timestampSeconds) || e.timestampSeconds < 0) throw new Error(`ingest: bad ts ${e.key}`);
    if (e.liquidityDeltaAtomic === undefined || e.volumeUsdcAtomic < 0n || e.feesUsdcAtomic < 0n) {
      throw new Error(`ingest: bad amounts ${e.key}`);
    }
    if (state.events.has(e.key)) {
      duplicates += 1;
      continue;
    }
    state.events.set(e.key, e);
    ingested += 1;
    const pk = normPool(e.pool);
    const cur = state.cursors.get(pk);
    if (!cur || e.blockNumber > cur.lastBlock) {
      state.cursors.set(pk, {
        pool: e.pool,
        lastBlock: e.blockNumber,
        lastTimestampSeconds: Math.max(cur?.lastTimestampSeconds ?? 0, e.timestampSeconds),
        eventCount: (cur?.eventCount ?? 0) + 1,
      });
    } else {
      // Same-block late event: count it but never move the cursor backwards.
      state.cursors.set(pk, { ...cur, eventCount: cur.eventCount + 1 });
    }
    if (!state.poolChain.has(pk)) state.poolChain.set(pk, chainId);
  }
  return { ingested, duplicates };
}

/** Read the cursor for a pool (null when never observed). */
export function getCursor(state: IndexerState, pool: string): Cursor | null {
  return state.cursors.get(normPool(pool)) ?? null;
}

/**
 * Build a windowed snapshot ending at `nowSeconds`. Events older than the
 * window are excluded from volume/fees but still anchor liquidity. Stale when
 * the newest event is older than `maxDataAgeSeconds` or no events exist.
 */
export function buildSnapshot(
  state: IndexerState,
  pool: string,
  opts: { chainId: number; nowSeconds: number; windowSeconds: number; maxDataAgeSeconds: number },
): Snapshot {
  const pk = normPool(pool);
  const events = [...state.events.values()].filter((e) => normPool(e.pool) === pk);
  const windowStart = opts.nowSeconds - opts.windowSeconds;
  let liquidity = 0n;
  let volume = 0n;
  let fees = 0n;
  let newestTs = -1;
  let newestBlock = 0;
  for (const e of events) {
    liquidity += e.liquidityDeltaAtomic;
    if (e.timestampSeconds >= windowStart) {
      volume += e.volumeUsdcAtomic;
      fees += e.feesUsdcAtomic;
    }
    if (e.timestampSeconds > newestTs) {
      newestTs = e.timestampSeconds;
      newestBlock = e.blockNumber;
    }
  }
  if (liquidity < 0n) liquidity = 0n; // floor: never report negative depth
  const dataAge = newestTs < 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, opts.nowSeconds - newestTs);
  return {
    pool,
    chainId: opts.chainId,
    blockNumber: newestBlock,
    timestampSeconds: opts.nowSeconds,
    liquidityAtomic: liquidity,
    volumeWindowUsdcAtomic: volume,
    feesWindowUsdcAtomic: fees,
    sampleWindowSeconds: opts.windowSeconds,
    dataAgeSeconds: dataAge === Number.MAX_SAFE_INTEGER ? opts.maxDataAgeSeconds + 1 : dataAge,
    stale: newestTs < 0 || dataAge > opts.maxDataAgeSeconds,
  };
}

/**
 * Reconcile a sampled position: recompute liquidity from events and compare
 * against a position-read value. Any mismatch is unexplained and must block
 * execution (target zero unexplained mismatches, PLAN.md §13).
 */
export function reconcileLiquidity(
  state: IndexerState,
  pool: string,
  observedLiquidityAtomic: bigint,
): { match: boolean; expectedAtomic: bigint; observedAtomic: bigint } {
  const pk = normPool(pool);
  let expected = 0n;
  for (const e of state.events.values()) {
    if (normPool(e.pool) === pk) expected += e.liquidityDeltaAtomic;
  }
  if (expected < 0n) expected = 0n;
  return { match: expected === observedLiquidityAtomic, expectedAtomic: expected, observedAtomic: observedLiquidityAtomic };
}
