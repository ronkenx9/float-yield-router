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
export {};
//# sourceMappingURL=test-e2e-vault.d.ts.map