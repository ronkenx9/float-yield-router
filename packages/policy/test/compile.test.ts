import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePermissions, checkAction, usdcToAtomic } from '../src/index.ts';
import { validPolicy, validAction, ADDR } from './fixtures.ts';

function perm(overrides = {}) {
  return compilePermissions(validPolicy(overrides));
}
function codes(r: ReturnType<typeof checkAction>): string[] {
  return r.violations.map((x) => x.code);
}

test('compiled maxPosition is bps of budget', () => {
  const p = perm();
  assert.equal(p.limits.maxPositionAtomic, usdcToAtomic('50')); // 10% of 500
});

test('a valid action passes every gate', () => {
  const r = checkAction(perm(), validAction());
  assert.ok(r.ok, `expected ok, got: ${JSON.stringify(r.violations)}`);
});

test('rejects a pool not in the allowlist', () => {
  const r = checkAction(perm(), validAction({ pool: '0xdeadbeef' }));
  assert.ok(codes(r).includes('POOL_NOT_ALLOWED'));
});

test('rejects an unknown contract and selector', () => {
  const r = checkAction(perm(), validAction({ contract: '0xbad', selector: '0xffffffff' }));
  assert.ok(codes(r).includes('CONTRACT_NOT_ALLOWED'));
  assert.ok(codes(r).includes('SELECTOR_NOT_ALLOWED'));
});

test('rejects a token not in the allowlist', () => {
  const r = checkAction(perm(), validAction({ tokensTouched: [ADDR.USDC, '0xnotallowed'] }));
  assert.ok(codes(r).includes('TOKEN_NOT_ALLOWED'));
});

test('rejects slippage, impact and gas over the caps', () => {
  const r = checkAction(
    perm(),
    validAction({ slippageBps: 500, priceImpactBps: 999, gasAtomic: usdcToAtomic('10') }),
  );
  const c = codes(r);
  assert.ok(c.includes('SLIPPAGE_EXCEEDED'));
  assert.ok(c.includes('IMPACT_EXCEEDED'));
  assert.ok(c.includes('GAS_EXCEEDED'));
});

test('rejects an ENTER larger than maxPosition', () => {
  const r = checkAction(perm(), validAction({ notionalAtomic: usdcToAtomic('80') }));
  assert.ok(codes(r).includes('POSITION_SIZE_EXCEEDED'));
});

test('fails closed on a stale quote and stale data', () => {
  const r = checkAction(perm(), validAction({ quoteAgeSeconds: 999, dataAgeSeconds: 999 }));
  const c = codes(r);
  assert.ok(c.includes('QUOTE_STALE'));
  assert.ok(c.includes('DATA_STALE'));
});

test('fails closed when the policy is paused', () => {
  const r = checkAction(perm({ pauseState: 'paused' }), validAction());
  assert.ok(codes(r).includes('PAUSED'));
});

test('rejects a disabled capability even if everything else is valid', () => {
  const r = checkAction(perm({ allowNewPoolEntry: false }), validAction({ type: 'ENTER' }));
  assert.ok(codes(r).includes('ACTION_NOT_ALLOWED'));
});

test('address matching is case-insensitive', () => {
  const r = checkAction(perm(), validAction({ pool: ADDR.POOL.toUpperCase() }));
  assert.ok(r.ok, `expected ok, got: ${JSON.stringify(r.violations)}`);
});
