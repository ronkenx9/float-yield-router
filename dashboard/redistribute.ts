import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.CIRCLE_API_KEY || '';
const entitySecret = process.env.CIRCLE_ENTITY_SECRET || '';

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const USDC_CONTRACT = "0x3600000000000000000000000000000000000000";

const wallets = {
  'trader-a': '8c1f5e79-5b46-5391-a527-0a6b7ff48ba0',
  'trader-b': '94c20218-7750-5f4b-bf86-3f0e6e38f850',
  'trader-c': '2c6189c5-d31e-5c06-9f2a-45fe9c82ad6c',
};

async function getAddress(walletId: string): Promise<string> {
  const res = await client.getWallet({ id: walletId });
  return res.data?.wallet?.address || '';
}

async function transferUSDC(fromWalletId: string, toAddress: string, amountUSDC: number) {
  const rawAmount = Math.floor(amountUSDC * 1e6).toString(); // 6 decimals
  console.log(`Transferring ${amountUSDC} USDC from ${fromWalletId} to ${toAddress}...`);
  const response = await client.createContractExecutionTransaction({
    walletId: fromWalletId,
    contractAddress: USDC_CONTRACT,
    abiFunctionSignature: "transfer(address,uint256)",
    abiParameters: [toAddress, rawAmount],
    fee: { type: "level", config: { feeLevel: "HIGH" } },
  });
  return response.data?.id;
}

async function main() {
  try {
    const addrA = await getAddress(wallets['trader-a']);
    const addrB = await getAddress(wallets['trader-b']);
    const addrC = await getAddress(wallets['trader-c']);

    console.log(`Trader A Address: ${addrA}`);
    console.log(`Trader B Address: ${addrB}`);
    console.log(`Trader C Address: ${addrC}`);

    // Let's send 5 USDC from Trader C to Trader A and 5 USDC to Trader B
    const txIdA = await transferUSDC(wallets['trader-c'], addrA, 5.0);
    console.log(`TX ID for Trader A: ${txIdA}`);

    const txIdB = await transferUSDC(wallets['trader-c'], addrB, 5.0);
    console.log(`TX ID for Trader B: ${txIdB}`);

    console.log("Transfers initiated successfully.");
  } catch (error: any) {
    console.error("Error during redistribution:", error.message || error);
  }
}

main();
