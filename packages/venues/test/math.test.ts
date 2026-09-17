import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBps,
  atomicToUsdc,
  fromAtomic,
  isFullV3Range,
  minReceivedAfterSlippage,
  netAfterCosts,
  pessimisticFeeEstimate,
  toAtomic,
  usdcToAtomic,
  validateV3Range,
} from '../src/index.ts';

test('usdc conversion is exact and rejects excess precision', () => {
  assert.equal(usdcToAtomic('40'), 40_000_000n);
  assert.equal(atomicToUsdc(40_000_000n), '40');
  assert.throws(() => usdcToAtomic('1.1234567'), /decimal places/);
  assert.throws(() => toAtomic('1e5', 6), /plain decimal/);
});

test('generic decimal conversion respects token decimals', () => {
  assert.equal(toAtomic('1.5', 18), 1_500_000_000_000_000_000n);
  assert.equal(fromAtomic(1_500_000_000_000_000_000n, 18), '1.5');
});

test('applyBps floors so caps never round up', () => {
  assert.equal(applyBps(999n, 1000), 99n); // 9.99 floored
  assert.equal(applyBps(500_000_000n, 1000), 50_000_000n);
});

test('min received floors slippage and rejects bad bps', () => {
  assert.equal(minReceivedAfterSlippage(40_000_000n, 30), 39_880_000n);
  assert.throws(() => minReceivedAfterSlippage(100n, 10_001), /slippage/);
});

test('pessimistic fees apply the haircut', () => {
  assert.equal(pessimisticFeeEstimate(30_000_000n, 2000), 24_000_000n); // -20%
  assert.throws(() => pessimisticFeeEstimate(-1n, 0), /fees/);
});

test('net-after-costs can go negative (HOLD signal)', () => {
  assert.equal(netAfterCosts(24_000_000n, 500_000n, 200_000n), 23_300_000n);
  assert.ok(netAfterCosts(100n, 500_000n, 200_000n) < 0n);
});

test('full-range detection matches ACTFUN graduation shape', () => {
  assert.ok(isFullV3Range(-887272, 887272));
  assert.ok(!isFullV3Range(-100, 100));
});

test('range validation enforces ordering, bounds, and spacing', () => {
  assert.deepEqual(validateV3Range(-60, 60, 60), []);
  assert.ok(validateV3Range(60, -60, 60).some((e) => e.includes('tickLower')));
  assert.ok(validateV3Range(-61, 60, 60).some((e) => e.includes('tickSpacing')));
  assert.ok(validateV3Range(-887273, 887272, 1).some((e) => e.includes('bounds')));
});
