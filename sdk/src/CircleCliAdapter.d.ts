import { type AgentWalletClient } from './FloatClient.js';
export interface CircleCliAdapterConfig {
    walletId?: string;
    walletAddress?: string;
    chain: string;
}
export declare class CircleCliAdapter implements AgentWalletClient {
    walletId: string;
    private walletAddress?;
    private chain;
    constructor(config: CircleCliAdapterConfig);
    private runCommand;
    getAddress(): Promise<string>;
    getBalance(tokenAddress?: string): Promise<number>;
    transfer(params: {
        amount: number;
        destinationAddress: string;
        tokenId?: string;
    }): Promise<{
        txHash: string;
        status: string;
    }>;
}
//# sourceMappingURL=CircleCliAdapter.d.ts.map