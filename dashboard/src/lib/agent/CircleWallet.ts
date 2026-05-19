import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const USDC_CONTRACT = "0x3600000000000000000000000000000000000000";
const FLOAT_VAULT = "0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6";

/**
 * Wrapper for Circle's Programmable Wallets SDK.
 * Handles server-side signing of transactions on the Arc L1.
 */
export class CircleWallet {
  private walletId: string;
  public circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient>;

  constructor(walletId: string, apiKey: string, entitySecret: string) {
    this.walletId = walletId;
    this.circleClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  }

  /**
   * Get the real USDC balance of this wallet from the Circle API.
   */
  async getUSDCBalance(): Promise<number> {
    const response = await this.circleClient.getWalletTokenBalance({ id: this.walletId });
    const balances = response.data?.tokenBalances;
    if (!balances || balances.length === 0) return 0;
    const usdcBalance = balances.find(b => b.token?.symbol === 'USDC');
    return usdcBalance ? parseFloat(usdcBalance.amount ?? '0') : 0;
  }

  /**
   * Approve the FloatVault to spend USDC on behalf of this wallet.
   * This MUST be called before park() can work.
   */
  async approveUSDC(amount: string): Promise<string> {
    console.log(`[CIRCLE WALLET] Approving FloatVault to spend ${amount} USDC...`);
    
    const response = await this.circleClient.createContractExecutionTransaction({
      walletId: this.walletId,
      contractAddress: USDC_CONTRACT,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [FLOAT_VAULT, amount],
      fee: { type: "level", config: { feeLevel: "HIGH" } },
    });

    const txId = response.data?.id || '';
    console.log(`[CIRCLE WALLET] ✅ Approve TX dispatched. ID: ${txId}`);
    return txId;
  }

  /**
   * Execute a contract call (park or withdraw) on the FloatVault.
   */
  async executeTransaction(to: string, signature: string, params: any[] = []): Promise<string> {
    console.log(`[CIRCLE WALLET] Initiating transaction from Developer Wallet ${this.walletId}...`);
    console.log(`[CIRCLE WALLET] Contract: ${to} | Signature: ${signature} | Params:`, params);

    const response = await this.circleClient.createContractExecutionTransaction({
      walletId: this.walletId,
      contractAddress: to,
      abiFunctionSignature: signature,
      abiParameters: params,
      fee: { type: "level", config: { feeLevel: "HIGH" } },
    });

    const txId = response.data?.id || `pending-${Date.now()}`;
    console.log(`[CIRCLE WALLET] ✅ Transaction dispatched on Arc. ID: ${txId}`);
    return txId;
  }

  /**
   * Poll a transaction until it reaches a terminal state (COMPLETE or FAILED).
   * Returns the final transaction state.
   */
  async waitForTransaction(txId: string, maxAttempts = 30, intervalMs = 2000): Promise<{ state: string; txHash?: string; errorDetails?: string }> {
    console.log(`[CIRCLE WALLET] Polling TX ${txId}...`);
    
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.circleClient.getTransaction({ id: txId });
      const tx = response.data?.transaction;
      const state = tx?.state ?? 'UNKNOWN';
      
      if (state === 'COMPLETE') {
        console.log(`[CIRCLE WALLET] ✅ TX COMPLETE. Hash: ${tx?.txHash}`);
        return { state, txHash: tx?.txHash };
      }
      
      if (state === 'FAILED' || state === 'CANCELLED' || state === 'DENIED') {
        const errorDetails = (tx as any)?.errorDetails || 'Unknown error';
        console.error(`[CIRCLE WALLET] ❌ TX ${state}: ${errorDetails}`);
        return { state, errorDetails };
      }
      
      console.log(`[CIRCLE WALLET]   ... attempt ${i + 1}/${maxAttempts}: state=${state}`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    return { state: 'TIMEOUT', errorDetails: 'Max polling attempts reached' };
  }

  private address?: string;

  async getAddress(): Promise<string> {
    if (this.address) return this.address;
    const response = await this.circleClient.getWallet({ id: this.walletId });
    this.address = response.data?.wallet?.address || '';
    return this.address;
  }

  getWalletId(): string {
    return this.walletId;
  }
}
