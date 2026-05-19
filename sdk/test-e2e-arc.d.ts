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
export {};
//# sourceMappingURL=test-e2e-arc.d.ts.map