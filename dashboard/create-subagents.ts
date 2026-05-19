import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

async function main() {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  });

  // Use the existing wallet set
  const walletSetId = "0c12affb-4185-54b7-9aca-9d0a7b87af7f";

  console.log("Creating 2 subagent wallets on Arc Testnet...\n");

  const response = await client.createWallets({
    walletSetId,
    blockchains: ["ARC-TESTNET"],
    count: 2,
    accountType: "EOA",
  });

  const wallets = response.data?.wallets || [];

  wallets.forEach((w, i) => {
    const strategy = i === 0 ? "AGGRESSIVE" : "CONSERVATIVE";
    console.log(`✅ Subagent ${strategy}:`);
    console.log(`   Wallet ID:  ${w.id}`);
    console.log(`   Address:    ${w.address}`);
    console.log(`   Blockchain: ${w.blockchain}\n`);
  });

  // Also print the original wallet for reference
  console.log(`Existing BALANCED agent:`);
  console.log(`   Wallet ID:  ${process.env.CIRCLE_WALLET_ID}`);
  console.log(`\nFund these addresses from https://faucet.circle.com:`);
  wallets.forEach((w, i) => {
    console.log(`   ${i === 0 ? 'AGGRESSIVE' : 'CONSERVATIVE'}: ${w.address}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
