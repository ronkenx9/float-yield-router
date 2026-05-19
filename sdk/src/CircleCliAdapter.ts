import { exec } from 'child_process';
import { promisify } from 'util';
import { type AgentWalletClient } from './FloatClient.js';

const execAsync = promisify(exec);

export interface CircleCliAdapterConfig {
  walletId?: string;
  walletAddress?: string;
  chain: string;
}

export class CircleCliAdapter implements AgentWalletClient {
  public walletId: string;
  private walletAddress?: string;
  private chain: string;

  constructor(config: CircleCliAdapterConfig) {
    this.walletId = config.walletId || '';
    if (config.walletAddress !== undefined) {
      this.walletAddress = config.walletAddress;
    }
    this.chain = config.chain.toUpperCase();
  }

  private async runCommand(cmd: string): Promise<any> {
    try {
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    } catch (err: any) {
      // Check for Terms Gate error
      if (err.message && err.message.includes('Terms acceptance is required')) {
        throw new Error(
          '[FLOAT] Circle CLI terms acceptance is required. Please run "circle terms accept" on your machine before using FLOAT.'
        );
      }
      throw new Error(`[FLOAT] Circle CLI command failed: ${err.stderr || err.message}`);
    }
  }

  async getAddress(): Promise<string> {
    if (this.walletAddress) {
      return this.walletAddress;
    }

    console.log('[FLOAT] Querying wallet address from Circle CLI...');
    const result = await this.runCommand(`circle wallet list --chain ${this.chain} --type agent --output json`);
    
    const wallets = result?.data?.wallets || [];
    if (wallets.length === 0) {
      throw new Error(`[FLOAT] No agent wallets found on chain ${this.chain} in Circle CLI.`);
    }

    const matched = this.walletId 
      ? wallets.find((w: any) => w.id === this.walletId)
      : wallets[0];

    if (!matched) {
      throw new Error(`[FLOAT] Wallet ID ${this.walletId} not found in Circle CLI wallet list.`);
    }

    this.walletAddress = matched.address;
    if (!this.walletId) {
      this.walletId = matched.id;
    }

    return this.walletAddress!;
  }

  async getBalance(tokenAddress?: string): Promise<number> {
    const address = await this.getAddress();
    const result = await this.runCommand(`circle wallet balance --address ${address} --chain ${this.chain} --output json`);
    
    const balances = result?.data?.balances || [];
    
    const matched = tokenAddress 
      ? balances.find((b: any) => b.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase() || b.token?.toUpperCase() === 'USDC')
      : balances.find((b: any) => b.token?.toUpperCase() === 'USDC');

    return matched ? parseFloat(matched.amount) : 0;
  }

  async transfer(params: {
    amount: number;
    destinationAddress: string;
    tokenId?: string;
  }): Promise<{ txHash: string; status: string }> {
    const sourceAddress = await this.getAddress();
    
    console.log(`[FLOAT] Invoking: circle wallet transfer ${params.destinationAddress} --amount ${params.amount} --address ${sourceAddress} --chain ${this.chain}`);
    
    const cmd = `circle wallet transfer ${params.destinationAddress} --amount ${params.amount} --address ${sourceAddress} --chain ${this.chain} --output json`;
    const result = await this.runCommand(cmd);

    const tx = result?.data?.transaction || {};
    return {
      txHash: tx.txHash || tx.id || '0xunknown',
      status: tx.status || 'COMPLETE'
    };
  }
}
