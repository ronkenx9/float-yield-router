import { ethers } from "hardhat";

async function main() {
  // Arc Testnet native USDC address (system contract)
  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  // Using USDC as USYC placeholder for testnet demo (no real USYC on testnet)
  const USYC_ADDRESS = "0x3600000000000000000000000000000000000000";

  console.log("Deploying FloatVault to Arc Testnet...");
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);

  const FloatVault = await ethers.getContractFactory("FloatVault");
  const vault = await FloatVault.deploy(USDC_ADDRESS, USYC_ADDRESS);
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  console.log(`✅ FloatVault deployed to: ${address}`);
  console.log(`\nUpdate your .env.local with:\nFLOAT_VAULT_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
