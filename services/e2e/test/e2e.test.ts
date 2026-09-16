import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runManagedLpOnce } from '../src/index.ts';
import type { E2EInput } from '../src/index.ts';

const ACCOUNT = '0x00000000000000000000000000000000000000ff';
const USDC = '0x3600000000000000000000000000000000000000';
const TOKEN = '0x0000000000000000000000000000000000000001';
const POOL = '0x00000000000000000000000000000000000000aa';
const NPM = '0x00000000000000000000000000000000000000bb';
const NOW = 1_700_000_000;
const DAY = 24 * 3600;
const U = (v: string): bigint => {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
};

function base(overrides: Partial<E2EInput> = {}): E2EInput {
  return {
    goalText: 'I have $500. Avoid newly launched tokens, keep 30% in USDC, and ask me before entering a new pool. Limit each position to 8%, USDC and WETH.',
    account: ACCOUNT,
    chainId: 5042002,
    allowlist: { usdc: USDC, token: TOKEN, tokenSymbol: 'WETH', tokenDecimals: 18, pool: POOL, npm: NPM, selector: '0x88316456' },
    nowSeconds: NOW,
    events: [
      { key: 'm1', pool: POOL, kind: 'mint', blockNumber: 100, timestampSeconds: NOW - 20 * DAY, liquidityDeltaAtomic: 5_000_000n, volumeUsdcAtomic: 0n, feesUsdcAtomic: 0n },
      { key: 's1', pool: POOL, kind: 'swap', blockNumber: 200, timestampSeconds: NOW - 5 * DAY, liquidityDeltaAtomic: 0n, volumeUsdcAtomic: U('8000'), feesUsdcAtomic: U('24') },
      { key: 's2', pool: POOL, kind: 'swap', blockNumber: 300, timestampSeconds: NOW - 10, liquidityDeltaAtomic: 0n, volumeUsdcAtomic: U('4000'), feesUsdcAtomic: U('12') },
    ],
    observedFeesUsdcAtomic: U('10'),
    feeHaircutBps: 2000,
    poolAgeSeconds: 20 * DAY,
    submitter: async () => ({ txHash: '0xe2e-tx-1', nonce: 11 }),
    idempotencyKey: 'e2e-1',
    ...overrides,
  };
}

test('happy path executes, reconciles, reports net, and explains with receipt', async () => {
  const r = await runManagedLpOnce(base());
  assert.equal(r.outcome, 'EXECUTED');
  assert.equal(r.jobState, 'RECONCILED');
  assert.equal(r.txHash, '0xe2e-tx-1');
  assert.ok(r.netUsdcAtomic !== null && r.netUsdcAtomic > 0n);
  assert.ok(r.explanation.join(' ').includes('0xe2e-tx-1'));
  assert.ok(r.explanation.join(' ').includes('policy v1'));
});

test('dust fees HOLD with no transaction', async () => {
  const r = await runManagedLpOnce(base({ observedFeesUsdcAtomic: U('0.01'), idempotencyKey: 'e2e-hold' }));
  assert.equal(r.outcome, 'HOLD');
  assert.equal(r.txHash, null);
  assert.ok(r.explanation.join(' ').includes('HOLD'));
});

test('missing data fails closed to HOLD', async () => {
  const r = await runManagedLpOnce(base({ events: [], idempotencyKey: 'e2e-stale' }));
  assert.equal(r.outcome, 'HOLD');
  assert.equal(r.txHash, null);
});

test('unstated capital asks instead of inferring', async () => {
  const r = await runManagedLpOnce(base({ goalText: 'Balanced risk, keep some USDC.', idempotencyKey: 'e2e-needs' }));
  assert.equal(r.outcome, 'NEEDS_INPUT');
  assert.ok(r.detail.join(' ').includes('How much USDC'));
});
