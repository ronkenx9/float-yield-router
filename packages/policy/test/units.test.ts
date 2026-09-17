import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usdcToAtomic, atomicToUsdc, applyBps, isValidBps } from '../src/index.ts';

test('usdcToAtomic parses whole and fractional USDC', () => {
  assert.equal(usdcToAtomic('1'), 1_000_000n);
  assert.equal(usdcToAtomic('0'), 0n);
  assert.equal(usdcToAtomic('12.5'), 12_500_000n);
  assert.equal(usdcToAtomic('0.000001'), 1n);
  assert.equal(usdcToAtomic('1000000'), 1_000_000_000_000n);
});

test('usdcToAtomic rejects precision loss and junk', () => {
  assert.throws(() => usdcToAtomic('0.0000001')); // 7 dp
  assert.throws(() => usdcToAtomic('1e6'));
  assert.throws(() => usdcToAtomic('abc'));
  assert.throws(() => usdcToAtomic(''));
});

test('atomicToUsdc round-trips and trims trailing zeros', () => {
  assert.equal(atomicToUsdc(1_000_000n), '1');
  assert.equal(atomicToUsdc(12_500_000n), '12.5');
  assert.equal(atomicToUsdc(1n), '0.000001');
  for (const s of ['0', '1', '12.5', '0.000001', '999999.999999']) {
    assert.equal(atomicToUsdc(usdcToAtomic(s)), s);
  }
});

test('applyBps floors and never rounds a cap upward', () => {
  assert.equal(applyBps(1_000_000n, 1000), 100_000n); // 10%
  assert.equal(applyBps(1_000_000n, 10_000), 1_000_000n); // 100%
  assert.equal(applyBps(1_000_000n, 0), 0n);
  // 33.33% of 1 USDC floors down, never up.
  assert.equal(applyBps(1_000_000n, 3333), 333_300n);
  assert.throws(() => applyBps(1n, -1));
});

test('isValidBps bounds', () => {
  assert.ok(isValidBps(0));
  assert.ok(isValidBps(10_000));
  assert.ok(!isValidBps(10_001));
  assert.ok(!isValidBps(-1));
  assert.ok(!isValidBps(12.5));
});
