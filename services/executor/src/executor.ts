/**
 * Durable executor (PLAN.md §5).
 *
 * State machine:
 *   DRAFT → SIMULATED → AWAITING_APPROVAL → APPROVED → SUBMITTING →
 *   SUBMITTED → CONFIRMED → RECONCILED
 * Plus: REJECTED, EXPIRED, CANCELLED, FAILED, RECONCILIATION_REQUIRED.
 *
 * Guarantees:
 * - Intent persisted before submission; idempotency key dedupes retries.
 * - Account-level serialization: one live job per account.
 * - Policy gate re-run immediately before submit (fail closed).
 * - Approval binds policy version, chain, account, calldata digest, value,
 *   spender, expiry, and quoted bounds. Out-of-bounds quotes need new approval.
 * - Never blindly resubmit after a timeout: Timeout → RECONCILIATION_REQUIRED,
 *   reconcile by hash/nonce + account state before any retry.
 * - Cancellation after broadcast is not guaranteed.
 *
 * No keys, no RPC, no real signing here. Chain submission is an injected
 * `Submitter` (faked in tests, wired to a signer/RPC in a later milestone).
 */

export const JOB_STATES = [
  'DRAFT',
  'SIMULATED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SUBMITTING',
  'SUBMITTED',
  'CONFIRMED',
  'RECONCILED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
  'RECONCILIATION_REQUIRED',
] as const;
export type JobState = (typeof JOB_STATES)[number];

export interface ActionIntent {
  type: 'ENTER' | 'RANGE_CHANGE' | 'COLLECT' | 'EXIT';
  pool: string;
  contract: string;
  selector: string;
  tokensTouched: string[];
  notionalAtomic: bigint;
  slippageBps: number;
  priceImpactBps: number;
  gasAtomic: bigint;
  quoteAgeSeconds: number;
  dataAgeSeconds: number;
}

export interface Approval {
  digest: string;
  spender: string;
  valueAtomic: bigint;
  expiresAtSeconds: number;
  /** Quoted bounds the approval covers. */
  minReceivedAtomic: bigint;
  quoteExpiresAtSeconds: number;
}

export interface Job {
  jobId: string;
  idempotencyKey: string;
  account: string;
  chainId: number;
  policyVersion: number;
  calldataDigest: string;
  intent: ActionIntent;
  approval: Approval | null;
  state: JobState;
  attempts: number;
  txHash: string | null;
  nonce: number | null;
  error: string | null;
  createdAtSeconds: number;
  updatedAtSeconds: number;
}

export interface Receipt {
  txHash: string;
  status: 'success' | 'reverted';
  blockNumber: number;
}

export type PolicyGate = (job: Job) => { ok: boolean; violations: string[] };
export type Submitter = (job: Job) => Promise<{ txHash: string; nonce: number }>;

export class TimeoutError extends Error {
  readonly txHash: string | null;
  constructor(message: string, txHash: string | null = null) {
    super(message);
    this.name = 'TimeoutError';
    this.txHash = txHash;
  }
}

export interface ExecutorStore {
  byKey: Map<string, Job>;
  byAccount: Map<string, string>;
  seq: number;
}

export function createStore(): ExecutorStore {
  return { byKey: new Map(), byAccount: new Map(), seq: 0 };
}

/** Deterministic approval-binding string (a real deployment hashes this). */
export function bindApproval(params: {
  policyVersion: number;
  chainId: number;
  account: string;
  calldataDigest: string;
  valueAtomic: bigint;
  spender: string;
  expirySeconds: number;
  minReceivedAtomic: bigint;
  quoteExpiresAtSeconds: number;
}): string {
  const ordered = {
    account: params.account.trim().toLowerCase(),
    calldataDigest: params.calldataDigest.trim().toLowerCase(),
    chainId: params.chainId,
    expirySeconds: params.expirySeconds,
    minReceivedAtomic: params.minReceivedAtomic.toString(),
    policyVersion: params.policyVersion,
    quoteExpiresAtSeconds: params.quoteExpiresAtSeconds,
    spender: params.spender.trim().toLowerCase(),
    valueAtomic: params.valueAtomic.toString(),
  };
  return `approval:${JSON.stringify(ordered)}`;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function touch(job: Job): void {
  job.updatedAtSeconds = now();
}

/** Create (or return the existing) job for an idempotency key. */
export function createJob(
  store: ExecutorStore,
  input: {
    idempotencyKey: string;
    account: string;
    chainId: number;
    policyVersion: number;
    calldataDigest: string;
    intent: ActionIntent;
  },
): Job {
  const existing = store.byKey.get(input.idempotencyKey);
  if (existing) return existing;
  store.seq += 1;
  const job: Job = {
    jobId: `job_${store.seq}`,
    idempotencyKey: input.idempotencyKey,
    account: input.account,
    chainId: input.chainId,
    policyVersion: input.policyVersion,
    calldataDigest: input.calldataDigest,
    intent: input.intent,
    approval: null,
    state: 'DRAFT',
    attempts: 0,
    txHash: null,
    nonce: null,
    error: null,
    createdAtSeconds: now(),
    updatedAtSeconds: now(),
  };
  store.byKey.set(input.idempotencyKey, job);
  return job;
}

export function markSimulated(job: Job): void {
  if (job.state !== 'DRAFT') throw new Error(`markSimulated: bad state ${job.state}`);
  job.state = 'SIMULATED';
  touch(job);
}

export function requestApproval(job: Job): void {
  if (job.state !== 'SIMULATED') throw new Error(`requestApproval: bad state ${job.state}`);
  job.state = 'AWAITING_APPROVAL';
  touch(job);
}

export function attachApproval(job: Job, approval: Approval, nowSeconds: number): void {
  if (job.state !== 'AWAITING_APPROVAL') throw new Error(`attachApproval: bad state ${job.state}`);
  const expected = bindApproval({
    policyVersion: job.policyVersion,
    chainId: job.chainId,
    account: job.account,
    calldataDigest: job.calldataDigest,
    valueAtomic: approval.valueAtomic,
    spender: approval.spender,
    expirySeconds: approval.expiresAtSeconds,
    minReceivedAtomic: approval.minReceivedAtomic,
    quoteExpiresAtSeconds: approval.quoteExpiresAtSeconds,
  });
  if (approval.digest !== expected) throw new Error('attachApproval: digest mismatch (approval not bound to this intent)');
  if (approval.expiresAtSeconds <= nowSeconds) throw new Error('attachApproval: approval expired');
  if (approval.quoteExpiresAtSeconds <= nowSeconds) throw new Error('attachApproval: quote expired');
  job.approval = approval;
  job.state = 'APPROVED';
  touch(job);
}

export function rejectJob(job: Job, reason: string): void {
  if (job.state !== 'AWAITING_APPROVAL' && job.state !== 'APPROVED') {
    throw new Error(`rejectJob: bad state ${job.state}`);
  }
  job.state = 'REJECTED';
  job.error = reason;
  touch(job);
}

/** Policy change invalidates outstanding (pre-broadcast) proposals. */
export function invalidateOnPolicyChange(job: Job, newPolicyVersion: number): void {
  if (newPolicyVersion === job.policyVersion) return;
  if (job.state === 'SUBMITTED' || job.state === 'CONFIRMED' || job.state === 'RECONCILED') return;
  job.state = 'EXPIRED';
  job.error = `policy v${job.policyVersion} superseded by v${newPolicyVersion}`;
  touch(job);
}

/** Cancel before broadcast. After broadcast, cancellation is not guaranteed. */
export function cancelJob(store: ExecutorStore, job: Job): { cancelled: boolean; note: string } {
  if (job.state === 'SUBMITTED' || job.state === 'CONFIRMED' || job.state === 'RECONCILED') {
    return { cancelled: false, note: 'cancellation after broadcast is not guaranteed; reconcile by hash/nonce' };
  }
  if (job.state === 'CANCELLED' || job.state === 'EXPIRED' || job.state === 'FAILED') {
    return { cancelled: false, note: `already terminal (${job.state})` };
  }
  job.state = 'CANCELLED';
  job.error = 'cancelled by user before broadcast';
  touch(job);
  if (store.byAccount.get(job.account.toLowerCase()) === job.jobId) {
    store.byAccount.delete(job.account.toLowerCase());
  }
  return { cancelled: true, note: 'cancelled before broadcast' };
}

function lockAccount(store: ExecutorStore, job: Job): void {
  const key = job.account.toLowerCase();
  const holder = store.byAccount.get(key);
  if (holder && holder !== job.jobId) throw new Error('ACCOUNT_LOCKED: another job holds this account');
  store.byAccount.set(key, job.jobId);
}

function unlockAccount(store: ExecutorStore, job: Job): void {
  const key = job.account.toLowerCase();
  if (store.byAccount.get(key) === job.jobId) store.byAccount.delete(key);
}

/**
 * Submit an approved job. Re-runs the policy gate first; persists SUBMITTING
 * before calling the submitter. Timeouts move to RECONCILIATION_REQUIRED and
 * must be reconciled before any retry — no blind resubmits.
 */
export async function submitJob(
  store: ExecutorStore,
  job: Job,
  gate: PolicyGate,
  submitter: Submitter,
  nowSeconds: number,
): Promise<Job> {
  if (job.state !== 'APPROVED') throw new Error(`submitJob: bad state ${job.state} (need APPROVED)`);
  if (!job.approval) throw new Error('submitJob: missing approval');
  lockAccount(store, job);

  const check = gate(job);
  if (!check.ok) {
    job.state = 'REJECTED';
    job.error = `policy gate: ${check.violations.join('; ')}`;
    touch(job);
    unlockAccount(store, job);
    return job;
  }
  if (job.approval.expiresAtSeconds <= nowSeconds || job.approval.quoteExpiresAtSeconds <= nowSeconds) {
    job.state = 'EXPIRED';
    job.error = 'approval or quote expired before submission; new approval required';
    touch(job);
    unlockAccount(store, job);
    return job;
  }

  job.state = 'SUBMITTING';
  job.attempts += 1;
  touch(job);
  try {
    const { txHash, nonce } = await submitter(job);
    job.txHash = txHash;
    job.nonce = nonce;
    job.state = 'SUBMITTED';
    touch(job);
  } catch (err) {
    if (err instanceof TimeoutError) {
      job.state = 'RECONCILIATION_REQUIRED';
      if (err.txHash) job.txHash = err.txHash;
      job.error = `submit timeout after broadcast-unknown; reconcile hash/nonce before retry: ${err.message}`;
      touch(job);
      // Keep the lock: the outcome is unknown until reconciled.
      return job;
    }
    job.state = 'FAILED';
    job.error = err instanceof Error ? err.message : String(err);
    touch(job);
    unlockAccount(store, job);
  }
  return job;
}

/**
 * Reconcile a pending job by hash/nonce + account state before any retry.
 * `onchain` describes what the chain actually shows for (account, nonce).
 */
export function reconcileJob(
  job: Job,
  onchain: { txHash: string | null; confirmed: boolean; accountNonce: number | null },
): Job {
  if (job.state !== 'RECONCILIATION_REQUIRED' && job.state !== 'SUBMITTED') {
    throw new Error(`reconcileJob: bad state ${job.state}`);
  }
  if (onchain.txHash && job.txHash && onchain.txHash.toLowerCase() !== job.txHash.toLowerCase()) {
    job.error = 'reconcile: hash mismatch — investigate before retry';
    touch(job);
    return job;
  }
  if (onchain.txHash && !job.txHash) job.txHash = onchain.txHash;
  if (onchain.confirmed) {
    job.state = 'CONFIRMED';
    job.error = null;
    touch(job);
  }
  // else: still pending — stay put, do not resubmit blindly.
  return job;
}

/** Retry after reconciliation only (never directly after a timeout). */
export async function retryJob(
  store: ExecutorStore,
  job: Job,
  gate: PolicyGate,
  submitter: Submitter,
  nowSeconds: number,
): Promise<Job> {
  if (job.state === 'RECONCILIATION_REQUIRED') {
    throw new Error('retryJob: reconcile by hash/nonce first — blind resubmit refused');
  }
  if (job.state !== 'FAILED' && job.state !== 'APPROVED') {
    throw new Error(`retryJob: bad state ${job.state}`);
  }
  if (job.state === 'FAILED') {
    job.state = 'APPROVED'; // re-enter the gate with fresh bounds check
    job.error = null;
    touch(job);
  }
  return submitJob(store, job, gate, submitter, nowSeconds);
}

/** Record a receipt; reverted receipts fail the job. */
export function confirmJob(store: ExecutorStore, job: Job, receipt: Receipt): Job {
  if (job.state !== 'SUBMITTED' && job.state !== 'CONFIRMED') {
    throw new Error(`confirmJob: bad state ${job.state}`);
  }
  if (!job.txHash || receipt.txHash.toLowerCase() !== job.txHash.toLowerCase()) {
    throw new Error('confirmJob: receipt hash does not match job txHash');
  }
  if (receipt.status === 'reverted') {
    job.state = 'FAILED';
    job.error = `transaction reverted in block ${receipt.blockNumber}`;
    touch(job);
    unlockAccount(store, job);
    return job;
  }
  job.state = 'CONFIRMED';
  touch(job);
  return job;
}

/** Final ledger reconciliation after confirmation (balances match receipts). */
export function markReconciled(store: ExecutorStore, job: Job): Job {
  if (job.state !== 'CONFIRMED') throw new Error(`markReconciled: bad state ${job.state}`);
  job.state = 'RECONCILED';
  touch(job);
  unlockAccount(store, job);
  return job;
}
