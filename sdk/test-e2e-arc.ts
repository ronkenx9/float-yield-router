/**
 * FLOAT SDK end-to-end test against real Circle Agent Wallet on ARC-TESTNET.
 *
 * Person A: Circle agent wallet (Wallet A) — Circle-managed sender
 * Person B: throwaway EOA — recipient
 *
 * Exercises:
 *   - CircleCliAdapter constructor + Terms gate check
 *   - getAddress() via `circle wallet list`
 *   - getBalance() via `circle wallet balance`
 *   - transfer() with waitForConfirmation + enableReplacement (calls accelerate if stuck)
 *   - FloatClient.wrapPayment() with sufficient liquid (no-recall path)
 *
 * Run: `npx tsx test-e2e-arc.ts`
 */

import { CircleCliAdapter } from './src/CircleCliAdapter.js';
import { FloatClient } from './src/FloatClient.js';

const ARC_USDC = '0x3600000000000000000000000000000000000000';
const ARC_VAULT = '0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6';
const WALLET_A = '0xd19228b9433577605d485dc94b3e02840aed0c65';
const WALLET_B = '0xf9Ebd14C496791228cBc2635b820525E676b3f6D';
const AMOUNT_USDC = 1;

function banner(s: string) {
  console.log(`\n${'═'.repeat(70)}\n  ${s}\n${'═'.repeat(70)}`);
}

async function main() {
  banner('FLOAT SDK E2E — Arc Testnet, real Circle Agent Wallet');
  console.log(`Wallet A (sender, Circle-managed): ${WALLET_A}`);
  console.log(`Wallet B (recipient, EOA):         ${WALLET_B}`);
  console.log(`Amount:                            ${AMOUNT_USDC} USDC`);

  // ─── Step 1: instantiate adapter ────────────────────────────────────────
  banner('Step 1 — Instantiate CircleCliAdapter');
  const adapter = new CircleCliAdapter({
    chain: 'ARC-TESTNET',
    walletAddress: WALLET_A,
    confirmationTimeoutMs: 90_000,
    accelerateThresholdMs: 20_000,
    maxAccelerateAttempts: 1,
    confirmationPollMs: 3_000,
  });

  const resolvedAddr = await adapter.getAddress();
  console.log(`Resolved address: ${resolvedAddr}`);
  if (resolvedAddr.toLowerCase() !== WALLET_A.toLowerCase()) {
    throw new Error(`Address mismatch: expected ${WALLET_A}, got ${resolvedAddr}`);
  }

  // ─── Step 2: pre-flight balances ────────────────────────────────────────
  banner('Step 2 — Pre-flight balances');
  const liquidBefore = await adapter.getBalance(ARC_USDC);
  console.log(`Wallet A USDC: ${liquidBefore}`);
  if (liquidBefore < AMOUNT_USDC) {
    throw new Error(`Wallet A has insufficient USDC (${liquidBefore} < ${AMOUNT_USDC}). Fund it via faucet first.`);
  }

  // ─── Step 3: direct adapter transfer w/ confirmation ────────────────────
  banner('Step 3 — Direct adapter transfer (waitForConfirmation=true)');
  const t0 = Date.now();
  const transferResult = await adapter.transfer({
    amount: AMOUNT_USDC,
    destinationAddress: WALLET_B,
    waitForConfirmation: true,
    timeoutMs: 90_000,
    enableReplacement: true,
  });
  console.log(`Transfer result:`, transferResult);
  console.log(`Elapsed: ${Date.now() - t0}ms`);
  if (transferResult.status !== 'COMPLETE') {
    throw new Error(`Transfer did not reach COMPLETE: status=${transferResult.status}`);
  }

  // ─── Step 4: post-transfer balances ─────────────────────────────────────
  banner('Step 4 — Post-transfer balances');
  const liquidAfter = await adapter.getBalance(ARC_USDC);
  console.log(`Wallet A USDC: ${liquidBefore} → ${liquidAfter}  (delta ${liquidAfter - liquidBefore})`);
  if (liquidAfter >= liquidBefore) {
    console.warn(`⚠️  Wallet A balance did not decrease. Faucet may have backfilled, or fee credited elsewhere.`);
  }

  // ─── Step 5: FloatClient.wrapPayment end-to-end ─────────────────────────
  banner('Step 5 — FloatClient.wrapPayment (no-recall path)');
  const float = new FloatClient({
    vaultAddress: ARC_VAULT,
    usdcAddress: ARC_USDC,
    agentWalletId: adapter.walletId || WALLET_A,
    circleCLI: adapter,
    rpcUrl: 'https://rpc.testnet.arc.network',
    maxRecallFrequencyPerHour: 2,
    recallConfirmationTimeoutMs: 90_000,
    enableRecallReplacement: true,
  });

  // The user's payment executor: in real use this would call into the agent's
  // own logic (e.g. ArcPerps deposit, DCA buy). For this test it just transfers
  // from Wallet A to Person B via the same adapter.
  const paymentExecutor = async (amount: number, recipient: string) => {
    console.log(`[paymentExecutor] sending ${amount} USDC → ${recipient}`);
    return adapter.transfer({
      amount,
      destinationAddress: recipient,
      waitForConfirmation: true,
      timeoutMs: 90_000,
      enableReplacement: true,
    });
  };

  const wrapped = float.wrapPayment(paymentExecutor);
  const wrapResult = await wrapped(AMOUNT_USDC, WALLET_B);
  console.log(`wrapPayment result:`, wrapResult);

  // ─── Step 6: final balances ─────────────────────────────────────────────
  banner('Step 6 — Final balances');
  const liquidFinal = await adapter.getBalance(ARC_USDC);
  console.log(`Wallet A USDC: ${liquidFinal}`);
  console.log(`Total spent this run: ${liquidBefore - liquidFinal} USDC across 2 transfers.`);

  banner('✅ E2E test passed');
}

main().catch(err => {
  console.error('\n❌ E2E test failed:', err.message || err);
  process.exit(1);
});
