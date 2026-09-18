import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorityIncreased,
  checkAction,
  compilePermissions,
  usdcToAtomic,
} from '../src/index.ts';
import { ADDR, validAction, validPolicy } from './fixtures.ts';

function swapAction(overrides = {}) {
  return validAction({
    type: 'SWAP',
    notionalAtomic: usdcToAtomic('40'),
    ...overrides,
  });
}

test('SWAP is rejected by default (MVP policies leave trading disabled)', () => {
  const r = checkAction(compilePermissions(validPolicy()), swapAction());
  assert.ok(!r.ok);
  assert.ok(r.violations.some((v) => v.code === 'ACTION_NOT_ALLOWED'));
});

test('SWAP passes when allowSwap is on and everything is allowlisted', () => {
  const perm = compilePermissions(validPolicy({ allowSwap: true }));
  const r = checkAction(perm, swapAction());
  assert.ok(r.ok, JSON.stringify(r.violations));
});

test('SWAP respects position size, slippage, and stale gates', () => {
  const perm = compilePermissions(validPolicy({ allowSwap: true }));
  assert.ok(checkAction(perm, swapAction({ notionalAtomic: usdcToAtomic('80') })).violations.some((v) => v.code === 'POSITION_SIZE_EXCEEDED'));
  assert.ok(checkAction(perm, swapAction({ slippageBps: 500 })).violations.some((v) => v.code === 'SLIPPAGE_EXCEEDED'));
  assert.ok(checkAction(perm, swapAction({ tokensTouched: [ADDR.USDC, '0x00000000000000000000000000000000000000ff'] })).violations.some((v) => v.code === 'TOKEN_NOT_ALLOWED'));
});

test('enabling allowSwap is an authority increase needing fresh approval', () => {
  const prev = validPolicy();
  const next = validPolicy({ allowSwap: true, version: 2 });
  const r = authorityIncreased(prev, next);
  assert.ok(r.violations.some((v) => v.code === 'SWAP_ENABLED'));
  assert.ok(authorityIncreased(prev, validPolicy()).violations.length === 0);
});
