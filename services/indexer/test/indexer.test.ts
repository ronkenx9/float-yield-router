import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, createIndexer, getCursor, ingestEvents, reconcileLiquidity } from '../src/index.ts';
import type { PoolEvent } from '../src/index.ts';

const POOL = '0x00000000000000000000000000000000000000aa';
const T0 = 1_700_000_000;
const DAY = 24 * 3600;

function ev(key: string, overrides: Partial<PoolEvent> = {}): PoolEvent {
  return {
    key,
    pool: POOL,
    kind: 'swap',
    blockNumber: 100,
    timestampSeconds: T0,
    liquidityDeltaAtomic: 0n,
    volumeUsdcAtomic: 1_000_000n,
    feesUsdcAtomic: 3_000n,
    ...overrides,
  };
}

test('ingest dedupes by key and counts duplicates', () => {
  const s = createIndexer();
  const r1 = ingestEvents(s, 5042002, [ev('a'), ev('b')]);
  assert.equal(r1.ingested, 2);
  const r2 = ingestEvents(s, 5042002, [ev('a'), ev('c')]);
  assert.equal(r2.ingested, 1);
  assert.equal(r2.duplicates, 1);
});

test('out-of-order batch still advances cursor to max block', () => {
  const s = createIndexer();
  ingestEvents(s, 5042002, [ev('b', { blockNumber: 200, timestampSeconds: T0 + 5 }), ev('a', { blockNumber: 100 })]);
  assert.equal(getCursor(s, POOL)?.lastBlock, 200);
});

test('cursor never moves backwards on late events', () => {
  const s = createIndexer();
  ingestEvents(s, 5042002, [ev('a', { blockNumber: 300 })]);
  ingestEvents(s, 5042002, [ev('b', { blockNumber: 100 })]);
  assert.equal(getCursor(s, POOL)?.lastBlock, 300);
  assert.equal(getCursor(s, POOL)?.eventCount, 2);
});

test('snapshot windows volume/fees but anchors liquidity over all history', () => {
  const s = createIndexer();
  ingestEvents(s, 5042002, [
    ev('old', { kind: 'mint', timestampSeconds: T0 - 30 * DAY, blockNumber: 1, liquidityDeltaAtomic: 500n, volumeUsdcAtomic: 999_000_000n, feesUsdcAtomic: 999_000n }),
    ev('new', { timestampSeconds: T0, blockNumber: 2, volumeUsdcAtomic: 1_000_000n, feesUsdcAtomic: 3_000n }),
  ]);
  const snap = buildSnapshot(s, POOL, { chainId: 5042002, nowSeconds: T0, windowSeconds: 14 * DAY, maxDataAgeSeconds: 60 });
  assert.equal(snap.liquidityAtomic, 500n);
  assert.equal(snap.volumeWindowUsdcAtomic, 1_000_000n);
  assert.equal(snap.stale, false);
});

test('empty pool gives a stale snapshot (fails closed)', () => {
  const s = createIndexer();
  const snap = buildSnapshot(s, POOL, { chainId: 5042002, nowSeconds: T0, windowSeconds: 14 * DAY, maxDataAgeSeconds: 60 });
  assert.equal(snap.stale, true);
});

test('stale data flagged when newest event exceeds max age', () => {
  const s = createIndexer();
  ingestEvents(s, 5042002, [ev('a', { timestampSeconds: T0 - 3600 })]);
  const snap = buildSnapshot(s, POOL, { chainId: 5042002, nowSeconds: T0, windowSeconds: 14 * DAY, maxDataAgeSeconds: 60 });
  assert.equal(snap.stale, true);
});

test('reconcile matches independently summed liquidity', () => {
  const s = createIndexer();
  ingestEvents(s, 5042002, [ev('a', { kind: 'mint', liquidityDeltaAtomic: 800n, volumeUsdcAtomic: 0n, feesUsdcAtomic: 0n }), ev('b', { kind: 'burn', liquidityDeltaAtomic: -300n, volumeUsdcAtomic: 0n, feesUsdcAtomic: 0n })]);
  const ok = reconcileLiquidity(s, POOL, 500n);
  assert.ok(ok.match);
  const bad = reconcileLiquidity(s, POOL, 499n);
  assert.ok(!bad.match && bad.expectedAtomic === 500n);
});

test('bad blocks and negative amounts throw', () => {
  const s = createIndexer();
  assert.throws(() => ingestEvents(s, 5042002, [ev('x', { blockNumber: -1 })]), /bad block/);
  assert.throws(() => ingestEvents(s, 5042002, [ev('y', { volumeUsdcAtomic: -1n })]), /bad amounts/);
});
