import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenPool } from '../src/index.ts';
import { usdcToAtomic } from '../src/index.ts';
import { CHAIN, snapshot, v3Pool } from './fixtures.ts';

const DAY = 24 * 3600;

function input(overrides = {}) {
  return {
    pool: v3Pool(),
    snapshot: snapshot(),
    nowSeconds: 1_700_000_000,
    minSampleWindowSeconds: 14 * DAY,
    minVolumeUsdcAtomic: usdcToAtomic('1000'),
    minLiquidityAtomic: 1000n,
    minPoolAgeSeconds: 14 * DAY,
    poolAgeSeconds: 20 * DAY as number | null,
    ...overrides,
  };
}

test('healthy public pool with 14-day history is eligible', () => {
  const r = screenPool(input());
  assert.ok(r.eligible, JSON.stringify(r));
});

test('insufficient history fails (no extrapolating opening-hour fees)', () => {
  const r = screenPool(input({ snapshot: snapshot({ sampleWindowSeconds: 3600 }) }));
  assert.ok(!r.eligible);
  assert.ok(r.reasons.some((x) => x.includes('insufficient history')));
});

test('young pool is flagged and rejected', () => {
  const r = screenPool(input({ poolAgeSeconds: 2 * DAY }));
  assert.ok(!r.eligible);
  assert.ok(r.riskFlags.includes('new-pool'));
});

test('unknown pool age fails closed', () => {
  const r = screenPool(input({ poolAgeSeconds: null }));
  assert.ok(!r.eligible);
  assert.ok(r.reasons.some((x) => x.includes('unknown pool age')));
});

test('thin volume and depth reject', () => {
  const thin = screenPool(input({ snapshot: snapshot({ volumeWindowUsdcAtomic: 1n, liquidityAtomic: 1n }) }));
  assert.ok(!thin.eligible);
});

test('creator-locked and non-v3 pools never pass screening', () => {
  const locked = screenPool(input({ pool: v3Pool({ isCreatorLocked: true }) }));
  assert.ok(!locked.eligible);
  const v4 = screenPool({
    ...input(),
    pool: v3Pool({ venueKind: 'uniswap-v4' }),
    snapshot: snapshot({ venueKind: 'uniswap-v4' }),
  });
  assert.ok(!v4.eligible);
});

test('snapshot mismatch fails closed', () => {
  const r = screenPool(input({ snapshot: snapshot({ chainId: CHAIN + 1 }) }));
  assert.ok(r.reasons.some((x) => x.includes('chain mismatch')));
});
