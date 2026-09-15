import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePolicy,
  authorityIncreased,
  usdcToAtomic,
  serializePolicy,
  parsePolicy,
  canonicalPolicyJson,
} from '../src/index.ts';
import { validPolicy } from './fixtures.ts';

function codes(p: ReturnType<typeof validatePolicy>): string[] {
  return p.violations.map((x) => x.code);
}

test('a valid Balanced policy passes', () => {
  const r = validatePolicy(validPolicy());
  assert.ok(r.ok, `expected ok, got: ${JSON.stringify(r.violations)}`);
});

test('rejects a non-Arc chain id', () => {
  const r = validatePolicy(validPolicy({ chainId: 1 }));
  assert.ok(!r.ok);
  assert.ok(codes(r).includes('CHAIN_NOT_ARC'));
});

test('rejects expiry before effective', () => {
  const r = validatePolicy(validPolicy({ effectiveAt: 2000, expiresAt: 1000 }));
  assert.ok(codes(r).includes('EXPIRY_BEFORE_EFFECTIVE'));
});

test('rejects reserve exceeding budget', () => {
  const r = validatePolicy(
    validPolicy({ minUsdcReserveAtomic: usdcToAtomic('600') }),
  );
  assert.ok(codes(r).includes('RESERVE_EXCEEDS_BUDGET'));
});

test('rejects maxPosition + reserve exceeding budget', () => {
  // 90% position + 30% reserve = 120% of budget.
  const r = validatePolicy(
    validPolicy({ maxPositionBps: 9000, maxTokenExposureBps: 9000 }),
  );
  assert.ok(codes(r).includes('POSITION_PLUS_RESERVE_EXCEEDS_BUDGET'));
});

test('rejects a pool cap that bypasses the token concentration cap', () => {
  const r = validatePolicy(
    validPolicy({ maxPositionBps: 6000, maxTokenExposureBps: 5000, minUsdcReserveAtomic: usdcToAtomic('0') }),
  );
  assert.ok(codes(r).includes('POSITION_CAP_BYPASSES_TOKEN_CAP'));
});

test('rejects bps out of range', () => {
  const r = validatePolicy(validPolicy({ maxSlippageBps: 10_001 }));
  assert.ok(codes(r).includes('BPS_OUT_OF_RANGE'));
});

test('rejects daily budget that cannot cover one action', () => {
  const r = validatePolicy(
    validPolicy({ dailyExecutionBudgetAtomic: usdcToAtomic('0.5'), maxGasPerActionAtomic: usdcToAtomic('1') }),
  );
  assert.ok(codes(r).includes('DAILY_BUDGET_BELOW_ONE_ACTION'));
});

test('rejects automated approval in the MVP', () => {
  const r = validatePolicy(validPolicy({ approvalMode: 'automated' }));
  assert.ok(codes(r).includes('AUTOMATION_NOT_IN_MVP'));
});

test('authorityIncreased: identical policy grants no new authority', () => {
  const p = validPolicy();
  assert.ok(authorityIncreased(p, p).ok);
});

test('authorityIncreased: bigger budget requires re-approval', () => {
  const prev = validPolicy();
  const next = validPolicy({ capitalBudgetUsdcAtomic: usdcToAtomic('1000') });
  const r = authorityIncreased(prev, next);
  assert.ok(!r.ok);
  assert.ok(r.violations.map((x) => x.code).includes('BUDGET_UP'));
});

test('authorityIncreased: lower reserve and new token both flagged', () => {
  const prev = validPolicy();
  const next = validPolicy({
    minUsdcReserveAtomic: usdcToAtomic('50'),
    allowedTokens: [...prev.allowedTokens, '0x00000000000000000000000000000000000000cd'],
  });
  const c = authorityIncreased(prev, next).violations.map((x) => x.code);
  assert.ok(c.includes('RESERVE_DOWN'));
  assert.ok(c.includes('TOKENS_ADDED'));
});

test('authorityIncreased: tightening (smaller budget) needs no re-approval', () => {
  const prev = validPolicy();
  const next = validPolicy({ capitalBudgetUsdcAtomic: usdcToAtomic('250'), maxPositionBps: 500 });
  assert.ok(authorityIncreased(prev, next).ok);
});

test('serialize/parse round-trips exactly and money is stored as strings', () => {
  const p = validPolicy();
  const s = serializePolicy(p);
  assert.equal(typeof s.capitalBudgetUsdc, 'string');
  assert.equal(s.capitalBudgetUsdc, '500');
  const back = parsePolicy(s);
  assert.equal(back.capitalBudgetUsdcAtomic, p.capitalBudgetUsdcAtomic);
  assert.equal(back.minUsdcReserveAtomic, p.minUsdcReserveAtomic);
});

test('canonical json is stable regardless of allowlist ordering', () => {
  const a = validPolicy({ allowedTokens: ['0xB', '0xA'] });
  const b = validPolicy({ allowedTokens: ['0xA', '0xB'] });
  assert.equal(canonicalPolicyJson(a), canonicalPolicyJson(b));
});
