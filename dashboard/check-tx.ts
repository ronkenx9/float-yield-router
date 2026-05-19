import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

async function main() {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  });

  // Check recent transactions for this wallet
  const txId = "f2e398ef-b626-5b81-832b-c88788665aa6"; // The tx from our earlier simulation
  
  try {
    const response = await client.getTransaction({ id: txId });
    console.log("Transaction status:", JSON.stringify(response.data, null, 2));
  } catch (err: any) {
    console.error("Failed to fetch tx:", err.message);
  }

  // Also list recent transactions
  try {
    const walletId = process.env.CIRCLE_WALLET_ID!;
    const txList = await client.listTransactions({ walletIds: [walletId] });
    console.log("\nAll transactions for wallet:");
    console.log(JSON.stringify(txList.data, null, 2));
  } catch (err: any) {
    console.error("Failed to list transactions:", err.message);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
