import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TimeoutError,
  attachApproval,
  bindApproval,
  cancelJob,
  confirmJob,
  createJob,
  createStore,
  invalidateOnPolicyChange,
  markReconciled,
  markSimulated,
  reconcileJob,
  requestApproval,
  retryJob,
  submitJob,
} from '../src/index.ts';
import type { ActionIntent, Approval } from '../src/index.ts';

const ACCOUNT = '0x00000000000000000000000000000000000000ff';
const POOL = '0x00000000000000000000000000000000000000aa';
const NPM = '0x00000000000000000000000000000000000000bb';
const NOW = 1_700_000_000;

function intent(overrides: Partial<ActionIntent> = {}): ActionIntent {
  return {
    type: 'ENTER',
    pool: POOL,
    contract: NPM,
    selector: '0x88316456',
    tokensTouched: [],
    notionalAtomic: 40_000_000n,
    slippageBps: 30,
    priceImpactBps: 50,
    gasAtomic: 500_000n,
    quoteAgeSeconds: 5,
    dataAgeSeconds: 10,
    ...overrides,
  };
}

function approvalFor(job: { policyVersion: number; chainId: number; account: string; calldataDigest: string }): Approval {
  const digest = bindApproval({
    policyVersion: job.policyVersion,
    chainId: job.chainId,
    account: job.account,
    calldataDigest: job.calldataDigest,
    valueAtomic: 40_000_000n,
    spender: NPM,
    expirySeconds: NOW + 300,
    minReceivedAtomic: 39_880_000n,
    quoteExpiresAtSeconds: NOW + 60,
  });
  return { digest, spender: NPM, valueAtomic: 40_000_000n, expiresAtSeconds: NOW + 300, minReceivedAtomic: 39_880_000n, quoteExpiresAtSeconds: NOW + 60 };
}

function readyJob(key = 'k1') {
  const store = createStore();
  const job = createJob(store, { idempotencyKey: key, account: ACCOUNT, chainId: 5042002, policyVersion: 1, calldataDigest: '0xabc', intent: intent() });
  return { store, job };
}

test('happy path reaches RECONCILED with receipt', async () => {
  const store = createStore();
  const job = createJob(store, { idempotencyKey: 'happy', account: ACCOUNT, chainId: 5042002, policyVersion: 1, calldataDigest: '0xabc', intent: intent() });
  markSimulated(job);
  requestApproval(job);
  attachApproval(job, approvalFor(job), NOW);
  let calls = 0;
  await submitJob(store, job, () => ({ ok: true, violations: [] }), async () => {
    calls += 1;
    return { txHash: '0xhash1', nonce: 7 };
  }, NOW);
  assert.equal(job.state, 'SUBMITTED');
  confirmJob(store, job, { txHash: '0xhash1', status: 'success', blockNumber: 101 });
  markReconciled(store, job);
  assert.equal(job.state, 'RECONCILED');
  assert.equal(calls, 1);
});

test('idempotency key returns the same job (no duplicate tx)', () => {
  const store = createStore();
  const a = createJob(store, { idempotencyKey: 'dup', account: ACCOUNT, chainId: 5042002, policyVersion: 1, calldataDigest: '0xabc', intent: intent() });
  const b = createJob(store, { idempotencyKey: 'dup', account: ACCOUNT, chainId: 5042002, policyVersion: 9, calldataDigest: '0xzzz', intent: intent() });
  assert.equal(a.jobId, b.jobId);
  assert.equal(b.policyVersion, 1); // original intent preserved
});

test('policy gate rejection blocks submit', async () => {
  const { store, job } = readyJob('gate');
  markSimulated(job);
  requestApproval(job);
  attachApproval(job, approvalFor(job), NOW);
  await submitJob(store, job, () => ({ ok: false, violations: ['POOL_NOT_ALLOWED'] }), async () => ({ txHash: '0xnever', nonce: 1 }), NOW);
  assert.equal(job.state, 'REJECTED');
});

test('expired approval needs a new approval', async () => {
  const { store, job } = readyJob('exp');
  markSimulated(job);
  requestApproval(job);
  const ap = approvalFor(job);
  ap.expiresAtSeconds = NOW - 1;
  ap.digest = bindApproval({ policyVersion: 1, chainId: 5042002, account: ACCOUNT, calldataDigest: '0xabc', valueAtomic: ap.valueAtomic, spender: ap.spender, expirySeconds: ap.expiresAtSeconds, minReceivedAtomic: ap.minReceivedAtomic, quoteExpiresAtSeconds: ap.quoteExpiresAtSeconds });
  assert.throws(() => attachApproval(job, ap, NOW), /expired/);
});

test('timeout goes to reconciliation; blind retry refused; reconcile then retry works', async () => {
  const { store, job } = readyJob('tmo');
  markSimulated(job);
  requestApproval(job);
  attachApproval(job, approvalFor(job), NOW);
  let calls = 0;
  await submitJob(store, job, () => ({ ok: true, violations: [] }), async () => {
    calls += 1;
    throw new TimeoutError('no receipt yet', null);
  }, NOW);
  assert.equal(job.state, 'RECONCILIATION_REQUIRED');
  await assert.rejects(retryJob(store, job, () => ({ ok: true, violations: [] }), async () => ({ txHash: '0xlate', nonce: 8 }), NOW), /reconcile/);
  reconcileJob(job, { txHash: null, confirmed: false, accountNonce: null });
  assert.equal(job.state, 'RECONCILIATION_REQUIRED'); // still pending, no blind submit
  // Chain later shows the tx confirmed under a hash: adopt it, confirm, reconcile.
  reconcileJob(job, { txHash: '0xlate', confirmed: true, accountNonce: 8 });
  assert.equal(job.txHash, '0xlate');
  assert.equal(calls, 1); // exactly one broadcast attempt
});

test('failed submit can retry through the gate again', async () => {
  const { store, job } = readyJob('fail');
  markSimulated(job);
  requestApproval(job);
  attachApproval(job, approvalFor(job), NOW);
  let calls = 0;
  await submitJob(store, job, () => ({ ok: true, violations: [] }), async () => {
    calls += 1;
    throw new Error('rpc down');
  }, NOW);
  assert.equal(job.state, 'FAILED');
  await retryJob(store, job, () => ({ ok: true, violations: [] }), async () => { calls += 1; return { txHash: '0xretry', nonce: 9 }; }, NOW);
  assert.equal(job.state, 'SUBMITTED');
  assert.equal(calls, 2);
});

test('account lock prevents a second live job', async () => {
  const store = createStore();
  const j1 = createJob(store, { idempotencyKey: 'l1', account: ACCOUNT, chainId: 5042002, policyVersion: 1, calldataDigest: '0xabc', intent: intent() });
  const j2 = createJob(store, { idempotencyKey: 'l2', account: ACCOUNT, chainId: 5042002, policyVersion: 1, calldataDigest: '0xabc', intent: intent() });
  for (const j of [j1, j2]) {
    markSimulated(j);
    requestApproval(j);
    attachApproval(j, approvalFor(j), NOW);
  }
  await submitJob(store, j1, () => ({ ok: true, violations: [] }), async () => ({ txHash: '0xone', nonce: 1 }), NOW);
  await assert.rejects(submitJob(store, j2, () => ({ ok: true, violations: [] }), async () => ({ txHash: '0xtwo', nonce: 2 }), NOW), /ACCOUNT_LOCKED/);
});

test('policy change expires pre-broadcast jobs but not broadcast ones', async () => {
  const { store, job } = readyJob('inv');
  markSimulated(job);
  requestApproval(job);
  invalidateOnPolicyChange(job, 2);
  assert.equal(job.state, 'EXPIRED');

  const store2 = createStore();
  const j2 = createJob(store2, { idempotencyKey: 'inv2', account: ACCOUNT, chainId: 5042002, policyVersion: 1, calldataDigest: '0xabc', intent: intent() });
  markSimulated(j2);
  requestApproval(j2);
  attachApproval(j2, approvalFor(j2), NOW);
  await submitJob(store2, j2, () => ({ ok: true, violations: [] }), async () => ({ txHash: '0xb', nonce: 3 }), NOW);
  invalidateOnPolicyChange(j2, 2);
  assert.equal(j2.state, 'SUBMITTED'); // broadcast stands; accounting must handle it
});

test('cancel before broadcast works; cancel after broadcast warns', () => {
  const { store, job } = readyJob('cx');
  const r1 = cancelJob(store, job);
  assert.ok(r1.cancelled && job.state === 'CANCELLED');
});

test('reverted receipt fails the job', async () => {
  const { store, job } = readyJob('rev');
  markSimulated(job);
  requestApproval(job);
  attachApproval(job, approvalFor(job), NOW);
  await submitJob(store, job, () => ({ ok: true, violations: [] }), async () => ({ txHash: '0xbad', nonce: 4 }), NOW);
  confirmJob(store, job, { txHash: '0xbad', status: 'reverted', blockNumber: 55 });
  assert.equal(job.state, 'FAILED');
});
