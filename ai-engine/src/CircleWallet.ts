import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { ethers } from 'ethers';

/**
 * Wrapper for Circle's Programmable Wallets SDK.
 * Handles server-side signing of transactions on the Arc L1.
 */
export class CircleWallet {
  private walletId: string;
  private circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient>;
  
  constructor(walletId: string, apiKey: string, entitySecret: string) {
    this.walletId = walletId;
    this.circleClient = initiateDeveloperControlledWalletsClient({
      apiKey,
      entitySecret,
    });
  }

  /**
   * Autonomously signs and broadcasts a transaction using the Developer-Controlled Wallet.
   */
  async executeTransaction(to: string, signature: string, params: any[] = []): Promise<string> {
    console.log(`[CIRCLE WALLET] Initiating transaction from Developer Wallet ${this.walletId}...`);
    
    try {
      const response = await this.circleClient.createContractExecutionTransaction({
        walletId: this.walletId,
        contractAddress: to,
        fee: { type: "level", config: { feeLevel: "HIGH" } },
        abiFunctionSignature: signature,
        abiParameters: params
      });
      
      const txId = response.data?.id || `pending-${Date.now()}`;
      console.log(`[CIRCLE WALLET] Transaction dispatched. ID: ${txId}`);
      return txId;
    } catch (error) {
      console.error(`[CIRCLE WALLET] Transaction failed:`, error);
      throw error;
    }
  }
}
