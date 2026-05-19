import { CircleWallet } from './src/lib/agent/CircleWallet';

const FLOAT_VAULT = "0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6";

// 5 USDC in 6-decimal raw units
const PARK_AMOUNT = "5000000";

async function main() {
  const wallet = new CircleWallet(
    process.env.CIRCLE_WALLET_ID!,
    process.env.CIRCLE_API_KEY!,
    process.env.CIRCLE_ENTITY_SECRET!,
  );

  // ─── Step 1: Check starting balance ───
  console.log("\n[1/7] Checking wallet balance...");
  const startBalance = await wallet.getUSDCBalance();
  console.log(`  Balance: ${startBalance} USDC`);
  if (startBalance < 5) {
    console.error("  ❌ Insufficient balance. Need at least 5 USDC. Fund from faucet.");
    process.exit(1);
  }

  // ─── Step 2: Approve USDC spending ───
  console.log("\n[2/7] Approving USDC for FloatVault...");
  const approveTxId = await wallet.approveUSDC(PARK_AMOUNT);
  const approveResult = await wallet.waitForTransaction(approveTxId);
  if (approveResult.state !== 'COMPLETE') {
    console.error(`  ❌ Approve failed: ${approveResult.errorDetails}`);
    process.exit(1);
  }
  console.log(`  ✅ Approve confirmed. Hash: ${approveResult.txHash}`);

  // ─── Step 3: Park 5 USDC ───
  console.log("\n[3/7] Parking 5 USDC into FloatVault...");
  const parkTxId = await wallet.executeTransaction(FLOAT_VAULT, "park(uint256)", [PARK_AMOUNT]);
  
  // ─── Step 4: Wait for park to complete ───
  console.log("\n[4/7] Polling park transaction...");
  const parkResult = await wallet.waitForTransaction(parkTxId);
  if (parkResult.state !== 'COMPLETE') {
    console.error(`  ❌ Park failed: ${parkResult.errorDetails}`);
    process.exit(1);
  }
  console.log(`  ✅ Park confirmed on-chain! Hash: ${parkResult.txHash}`);

  // ─── Step 5: Check balance after park ───
  console.log("\n[5/7] Checking balance after park...");
  const midBalance = await wallet.getUSDCBalance();
  console.log(`  Balance: ${midBalance} USDC (should be ~${startBalance - 5})`);

  // ─── Step 6: Withdraw 5 USDC ───
  console.log("\n[6/7] Withdrawing 5 USDC from FloatVault...");
  const withdrawTxId = await wallet.executeTransaction(FLOAT_VAULT, "withdraw(uint256)", [PARK_AMOUNT]);
  const withdrawResult = await wallet.waitForTransaction(withdrawTxId);
  if (withdrawResult.state !== 'COMPLETE') {
    console.error(`  ❌ Withdraw failed: ${withdrawResult.errorDetails}`);
    process.exit(1);
  }
  console.log(`  ✅ Withdraw confirmed on-chain! Hash: ${withdrawResult.txHash}`);

  // ─── Step 7: Final balance ───
  console.log("\n[7/7] Checking final balance...");
  const finalBalance = await wallet.getUSDCBalance();
  console.log(`  Final balance: ${finalBalance} USDC`);

  console.log("\n═══════════════════════════════════════════════");
  console.log("  FLOAT END-TO-END TEST: ALL STEPS PASSED ✅");
  console.log("  Real USDC moved through FloatVault on Arc Testnet.");
  console.log(`  Start: ${startBalance} → Park: ${midBalance} → Final: ${finalBalance}`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("\n❌ TEST FAILED:", err.message || err);
  process.exit(1);
});
