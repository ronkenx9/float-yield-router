import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY!;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;

  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET is not set in .env.local");
  }

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  console.log("Creating Float Wallet Set...");
  const walletSetResponse = await client.createWalletSet({
    name: "Float Yield Router — Arc Testnet",
  });

  const walletSet = walletSetResponse.data?.walletSet;
  if (!walletSet?.id) throw new Error("Wallet set creation failed: no ID returned");
  console.log("✅ Wallet Set created:", walletSet.id);

  console.log("Creating developer-controlled wallet on Arc Testnet...");
  const walletResponse = await client.createWallets({
    walletSetId: walletSet.id,
    blockchains: ["ARC-TESTNET"],
    count: 1,
    accountType: "EOA",
  });

  const wallet = walletResponse.data?.wallets?.[0];
  if (!wallet) throw new Error("Wallet creation failed: no wallet returned");
  console.log("✅ Wallet created!");
  console.log(`   Wallet ID:  ${wallet.id}`);
  console.log(`   Address:    ${wallet.address}`);
  console.log(`   Blockchain: ${wallet.blockchain}`);

  // Write the wallet details to a file for reference
  const output = {
    walletSetId: walletSet.id,
    walletId: wallet.id,
    address: wallet.address,
    blockchain: wallet.blockchain,
  };
  fs.writeFileSync(
    path.resolve(process.cwd(), "circle_wallet_info.json"),
    JSON.stringify(output, null, 2)
  );
  console.log("\n📄 Wallet info saved to circle_wallet_info.json");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
