/**
 * FLOAT SDK vault E2E test — park & recall path on ARC-TESTNET.
 *
 * This test exercises the paths NOT covered by test-e2e-arc.ts:
 *   1. park()     — approve USDC + call FloatVault.park(uint256)
 *   2. getBalance() — read deposits[agent] from vault via RPC
 *   3. wrapPayment RECALL PATH — payment > liquid, vault covers deficit,
 *                                 withdraw confirmed, payment executes
 *
 * Pre-conditions:
 *   - Wallet A has ≥ 3 USDC liquid (2 to park, 1 for the forced-recall payment)
 *   - `circle wallet login --testnet` already done
 *
 * Run: `npx tsx test-e2e-vault.ts`
 */
import { ethers, Contract } from 'ethers';
import { CircleCliAdapter } from './src/CircleCliAdapter.js';
import { FloatClient } from './src/FloatClient.js';
const ARC_RPC = 'https://rpc.testnet.arc.network';
const ARC_USDC = '0x3600000000000000000000000000000000000000';
const ARC_VAULT = '0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6';
const WALLET_A = '0xd19228b9433577605d485dc94b3e02840aed0c65';
const WALLET_B = '0xf9Ebd14C496791228cBc2635b820525E676b3f6D';
const PARK_AMOUNT = 2; // USDC to park
const PAYMENT_AMOUNT = 1; // USDC payment that triggers recall
const VAULT_ABI = [
    'function deposits(address account) external view returns (uint256)',
    'function totalDeposits() external view returns (uint256)',
];
function banner(s) {
    console.log(`\n${'═'.repeat(70)}\n  ${s}\n${'═'.repeat(70)}`);
}
async function readDeposits(vaultAddress, walletAddress) {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const vault = new Contract(vaultAddress, VAULT_ABI, provider);
    const raw = await vault.deposits(walletAddress);
    return Number(ethers.formatUnits(raw, 6));
}
async function main() {
    banner('FLOAT SDK Vault E2E — Park + Recall path on Arc Testnet');
    console.log(`Wallet A (agent): ${WALLET_A}`);
    console.log(`Wallet B (recipient): ${WALLET_B}`);
    // ─── Step 1: adapter + pre-flight ───────────────────────────────────────
    banner('Step 1 — Instantiate adapter + pre-flight balance check');
    const adapter = new CircleCliAdapter({
        chain: 'ARC-TESTNET',
        walletAddress: WALLET_A,
        confirmationTimeoutMs: 120_000,
        accelerateThresholdMs: 30_000,
        maxAccelerateAttempts: 2,
        confirmationPollMs: 3_000,
    });
    const addr = await adapter.getAddress();
    console.log(`Resolved address: ${addr}`);
    const liquidBefore = await adapter.getBalance(ARC_USDC);
    const vaultBefore = await readDeposits(ARC_VAULT, WALLET_A);
    console.log(`Liquid USDC:  ${liquidBefore}`);
    console.log(`Vault deposit: ${vaultBefore}`);
    const needed = PARK_AMOUNT + PAYMENT_AMOUNT;
    if (liquidBefore < needed) {
        throw new Error(`Wallet A needs ≥ ${needed} USDC liquid (have ${liquidBefore}). ` +
            `Fund it via: circle wallet fund --address ${WALLET_A} --chain ARC-TESTNET`);
    }
    // ─── Step 2: park 2 USDC ────────────────────────────────────────────────
    banner(`Step 2 — Park ${PARK_AMOUNT} USDC into FloatVault (approve + park)`);
    const float = new FloatClient({
        vaultAddress: ARC_VAULT,
        usdcAddress: ARC_USDC,
        agentWalletId: WALLET_A,
        circleCLI: adapter,
        rpcUrl: ARC_RPC,
        maxRecallFrequencyPerHour: 5, // generous for testing
        recallConfirmationTimeoutMs: 120_000,
        enableRecallReplacement: true,
    });
    const t0 = Date.now();
    const parkResult = await float.park(PARK_AMOUNT);
    console.log(`park() result:`, parkResult);
    console.log(`Park elapsed: ${Date.now() - t0}ms`);
    if (parkResult.status !== 'COMPLETE') {
        throw new Error(`Park did not reach COMPLETE: status=${parkResult.status}`);
    }
    // ─── Step 3: verify vault state ─────────────────────────────────────────
    banner('Step 3 — Verify vault deposits[agent] increased');
    const vaultAfterPark = await readDeposits(ARC_VAULT, WALLET_A);
    const liquidAfterPark = await adapter.getBalance(ARC_USDC);
    console.log(`Vault deposit: ${vaultBefore} → ${vaultAfterPark}  (delta ${vaultAfterPark - vaultBefore})`);
    console.log(`Liquid USDC:   ${liquidBefore} → ${liquidAfterPark}  (delta ${liquidAfterPark - liquidBefore})`);
    if (vaultAfterPark < vaultBefore + PARK_AMOUNT - 0.001) {
        throw new Error(`Vault deposits did not increase by expected amount. ` +
            `Before: ${vaultBefore}, After: ${vaultAfterPark}, Expected increase: ${PARK_AMOUNT}`);
    }
    console.log(`✅ Park verified onchain.`);
    // ─── Step 4: force the recall path ──────────────────────────────────────
    // We need liquidBalance < PAYMENT_AMOUNT. After parking we still have
    // (liquidBefore - PARK_AMOUNT) liquid. If that's ≥ PAYMENT_AMOUNT,
    // wrapPayment won't recall. We'll temporarily use a FloatClient whose
    // getBalance mock reports low liquid — OR, if we parked enough that
    // liquid is genuinely below PAYMENT_AMOUNT, it works naturally.
    banner('Step 4 — wrapPayment RECALL path (liquid < payment, vault covers)');
    const liquidBeforeRecall = await adapter.getBalance(ARC_USDC);
    console.log(`Liquid before recall test: ${liquidBeforeRecall} USDC`);
    console.log(`Payment amount: ${PAYMENT_AMOUNT} USDC`);
    let floatClient;
    if (liquidBeforeRecall < PAYMENT_AMOUNT) {
        // Natural recall path: liquid is already below payment amount
        console.log(`→ Natural recall path: liquid (${liquidBeforeRecall}) < payment (${PAYMENT_AMOUNT})`);
        floatClient = float;
    }
    else {
        // Synthetic recall path: wrap the adapter to report artificially low liquid balance.
        // This tests the wrapPayment logic branch without needing to drain the wallet.
        console.log(`→ Liquid (${liquidBeforeRecall}) ≥ payment (${PAYMENT_AMOUNT}). ` +
            `Using synthetic recall path (low-balance shim).`);
        // Create a stateful shim adapter:
        //   - First getBalance() call (deficit check in wrapPayment) → returns 0.0001 to force recall
        //   - All subsequent calls (post-recall re-verification, paymentExecutor) → real balance
        // This simulates a wallet that was near-empty before the recall refilled it.
        let balanceCallCount = 0;
        const shimAdapter = new Proxy(adapter, {
            get(target, prop) {
                if (prop === 'getBalance') {
                    return async (tokenAddress) => {
                        balanceCallCount++;
                        if (balanceCallCount === 1) {
                            console.log(`[shim] getBalance call #${balanceCallCount}: returning 0.0001 (forcing deficit)`);
                            return 0.0001;
                        }
                        const real = await target.getBalance(tokenAddress);
                        console.log(`[shim] getBalance call #${balanceCallCount}: returning real balance ${real}`);
                        return real;
                    };
                }
                const val = target[prop];
                return typeof val === 'function' ? val.bind(target) : val;
            },
        });
        floatClient = new FloatClient({
            vaultAddress: ARC_VAULT,
            usdcAddress: ARC_USDC,
            agentWalletId: WALLET_A,
            circleCLI: shimAdapter,
            rpcUrl: ARC_RPC,
            maxRecallFrequencyPerHour: 5,
            recallConfirmationTimeoutMs: 120_000,
            enableRecallReplacement: true,
        });
    }
    // paymentExecutor: real transfer from A→B
    const paymentExecutor = async (amount, recipient) => {
        console.log(`[paymentExecutor] sending ${amount} USDC → ${recipient}`);
        return adapter.transfer({
            amount,
            destinationAddress: recipient,
            waitForConfirmation: true,
            timeoutMs: 120_000,
            enableReplacement: true,
        });
    };
    const t1 = Date.now();
    const wrapped = floatClient.wrapPayment(paymentExecutor);
    const wrapResult = await wrapped(PAYMENT_AMOUNT, WALLET_B);
    console.log(`wrapPayment (recall path) result:`, wrapResult);
    console.log(`Elapsed: ${Date.now() - t1}ms`);
    if (wrapResult?.status !== 'COMPLETE') {
        throw new Error(`wrapPayment recall path did not return COMPLETE status: ${JSON.stringify(wrapResult)}`);
    }
    console.log(`✅ Recall path verified — withdraw + payment both completed.`);
    // ─── Step 5: final state ────────────────────────────────────────────────
    banner('Step 5 — Final state');
    const vaultFinal = await readDeposits(ARC_VAULT, WALLET_A);
    const liquidFinal = await adapter.getBalance(ARC_USDC);
    console.log(`Vault deposit:  ${vaultAfterPark} → ${vaultFinal}  (delta ${vaultFinal - vaultAfterPark})`);
    console.log(`Liquid USDC:    ${liquidAfterPark} → ${liquidFinal}`);
    console.log(`Net USDC sent to Wallet B: ${PAYMENT_AMOUNT} USDC`);
    banner('✅ Vault E2E test passed — park + recall both verified');
}
main().catch(err => {
    console.error('\n❌ Vault E2E test failed:', err.message || err);
    process.exit(1);
});
//# sourceMappingURL=test-e2e-vault.js.map