import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

async function main() {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  });

  const walletId = process.env.CIRCLE_WALLET_ID ?? "94c20218-7750-5f4b-bf86-3f0e6e38f850";

  const response = await client.getWalletTokenBalance({ id: walletId });
  const balances = response.data?.tokenBalances;

  if (!balances || balances.length === 0) {
    console.log("⚠️  No token balances found yet. The faucet may still be processing.");
  } else {
    console.log(`✅ Balances for wallet ${walletId}:`);
    balances.forEach(b => {
      console.log(`   ${b.token?.symbol ?? 'Unknown'}: ${b.amount} (${b.token?.blockchain})`);
    });
  }
}

main().catch(err => { console.error("Error:", err.message || err); process.exit(1); });
