import { wrapAgent } from '../src/index.js';

// Setup your existing agent wallet config
const myAgent = {
  walletId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d", // your Circle Developer-Controlled Wallet ID
  address: "0xYourAgentWalletAddress",
  chain: "BASE", // could be ARC, BASE, ETHEREUM, etc.
};

// 1. Float your agent with a single line of code!
const floatedAgent = wrapAgent(myAgent, {
  strategy: 'balanced', // FLOAT dynamically adjusts liquid reserve ratio
  vault: 'USYC', // backing yield source
});

// 2. Wrap your agent's payment logic
const executePayment = async (amount: number, recipient: string) => {
  console.log(`Paying $${amount} to ${recipient}...`);
  // your existing on-chain payment logic
};

// Wrap it! FLOAT will check if you have enough liquid USDC in your wallet.
// If your wallet balance is low, FLOAT automatically recalls exactly what's needed
// from the yield vault, executing the payment seamlessly.
const safePayment = floatedAgent.wrapPayment(executePayment);

console.log("FLOAT: Agent wrapper successfully initialized.");
console.log("Ready to optimize idle capital with yield-bearing USYC.");
