import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explain, parseGoal, plan } from '../src/index.ts';
import type { PlanCandidate, PlannerCaps } from '../src/index.ts';

const U = (v: string): bigint => {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
};
const POOL = '0x00000000000000000000000000000000000000aa';

function caps(overrides: Partial<PlannerCaps> = {}): PlannerCaps {
  return {
    paused: false,
    maxPositionUsdcAtomic: U('50'),
    maxSlippageBps: 50,
    maxPriceImpactBps: 100,
    maxGasUsdcAtomic: U('1'),
    maxQuoteAgeSeconds: 30,
    maxDataAgeSeconds: 60,
    allowNewPoolEntry: true,
    allowRangeChange: true,
    allowFeeCollection: true,
    allowExitSwap: true,
    isNewPool: () => false,
    ...overrides,
  };
}

function cand(overrides: Partial<PlanCandidate> = {}): PlanCandidate {
  return {
    pool: POOL,
    action: 'ENTER',
    eligible: true,
    amountUsdcAtomic: U('40'),
    slippageBps: 30,
    priceImpactBps: 50,
    gasUsdcAtomic: U('0.5'),
    swapCostUsdcAtomic: U('0.2'),
    quoteAgeSeconds: 5,
    dataAgeSeconds: 10,
    observedFeesUsdcAtomic: U('10'),
    feeHaircutBps: 2000,
    ...overrides,
  };
}

test('parses the canonical example goal', () => {
  const r = parseGoal('I have $500. Avoid newly launched tokens, keep 30% in USDC, and ask me before entering a new pool.');
  assert.equal(r.draft.mode, 'Balanced');
  assert.equal(r.draft.capitalBudgetUsdcAtomic, 500_000_000n);
  assert.equal(r.draft.reserveBps, 3000);
  assert.ok(r.draft.avoidNewPools);
  assert.ok(r.draft.askBeforeNewPool);
});

test('never infers capital; missing amount is a blocking question', () => {
  const r = parseGoal('Keep 30% in USDC, balanced risk.');
  assert.equal(r.draft.capitalBudgetUsdcAtomic, null);
  assert.ok(r.questions.some((q) => q.includes('How much USDC')));
});

test('mode keywords map; aggressive never implies autonomy', () => {
  assert.equal(parseGoal('aggressive with $1000, keep 10% in USDC, limit each position to 20%, USDC and WETH, ask me before new pools').draft.mode, 'Aggressive');
  assert.equal(parseGoal('calm $200, keep 50% in USDC, limit 5% per position, USDC only, no new pools').draft.mode, 'Calm');
});

test('planner proposes the positive-net candidate', () => {
  const r = plan([cand()], caps());
  assert.equal(r.decision, 'PROPOSE');
  assert.equal(r.proposals.length, 1);
  assert.ok(r.proposals[0].netAfterCostsUsdcAtomic > 0n);
});

test('planner HOLDs when costs exceed pessimistic fees', () => {
  const r = plan([cand({ observedFeesUsdcAtomic: U('0.1') })], caps());
  assert.equal(r.decision, 'HOLD');
  assert.ok(r.holdReasons.join(' ').includes('HOLD'));
});

test('planner enforces caps, eligibility, staleness, and pause', () => {
  assert.equal(plan([cand({ eligible: false })], caps()).decision, 'HOLD');
  assert.equal(plan([cand({ slippageBps: 500 })], caps()).decision, 'HOLD');
  assert.equal(plan([cand({ quoteAgeSeconds: 999 })], caps()).decision, 'HOLD');
  assert.equal(plan([cand({ amountUsdcAtomic: U('80') })], caps()).decision, 'HOLD');
  assert.equal(plan([cand()], caps({ paused: true })).decision, 'HOLD');
  assert.equal(plan([cand()], caps({ allowRangeChange: false, isNewPool: () => false }) ).proposals.length, 1);
  const noNew = plan([cand()], caps({ allowNewPoolEntry: false, isNewPool: () => true }));
  assert.equal(noNew.decision, 'HOLD');
});

test('planner sorts by net and favors the better pool', () => {
  const a = cand({ pool: POOL, observedFeesUsdcAtomic: U('5') });
  const b = cand({ pool: '0x00000000000000000000000000000000000000bb', observedFeesUsdcAtomic: U('20') });
  const r = plan([a, b], caps());
  assert.equal(r.proposals[0].pool, b.pool);
});

test('collect with dust fees HOLDs', () => {
  const r = plan([cand({ action: 'COLLECT', amountUsdcAtomic: 0n, observedFeesUsdcAtomic: U('0.01') })], caps());
  assert.equal(r.decision, 'HOLD');
});

test('explanations cite evidence and label simulations', () => {
  const lines = explain({ kind: 'proposal', policyVersion: 3, pool: POOL, action: 'ENTER', amountUsdc: '40', pessimisticFeesUsdc: '8', costsUsdc: '0.7', netUsdc: '7.3', txHash: null, holdReason: null, extra: [] });
  assert.ok(lines.join(' ').includes('policy v3'));
  assert.ok(lines.join(' ').includes('Simulation, not a forecast'));
  const hold = explain({ kind: 'hold', policyVersion: 3, pool: POOL, action: null, amountUsdc: null, pessimisticFeesUsdc: null, costsUsdc: null, netUsdc: null, txHash: null, holdReason: 'costs exceed fees', extra: [] });
  assert.ok(hold.join(' ').includes('HOLD'));
  const exec = explain({ kind: 'execution', policyVersion: 3, pool: POOL, action: 'ENTER', amountUsdc: '40', pessimisticFeesUsdc: null, costsUsdc: null, netUsdc: null, txHash: '0xabc', holdReason: null, extra: [] });
  assert.ok(exec.join(' ').includes('0xabc'));
});
