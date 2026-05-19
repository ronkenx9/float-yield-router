export interface PaymentEvent {
    timestamp: string;
    amount: number;
}
/**
 * Interface definition for Circle's Agent Wallet Client / CLI wrapper.
 * Instructs the wallet to transact using its 2-of-2 MPC key management.
 * FLOAT never sees or touches the wallet's keys.
 */
export interface AgentWalletClient {
    walletId: string;
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
export interface FloatClientConfig {
    vaultAddress: string;
    usdcAddress: string;
    agentWalletId: string;
    circleCLI: AgentWalletClient;
    rpcUrl?: string;
    liquidReserve?: 'adaptive' | number | {
        ratio: number;
    };
    maxRecallFrequencyPerHour?: number;
}
export declare class FloatClient {
    private vaultAddress;
    private usdcAddress;
    private agentWalletId;
    private circleCLI;
    private vaultContract;
    private liquidReserve;
    private maxRecallFrequencyPerHour;
    private txHistory;
    private recallHistory;
    constructor(config: FloatClientConfig);
    /**
     * Computes the target liquid reserve based on current configuration and spend history.
     */
    calculateTargetReserve(totalBalance: number): Promise<{
        reserve: number;
        mode: string;
        samplesNeeded?: number;
    }>;
    /**
     * Instructs the Circle Agent Wallet to transfer USDC to FloatVault to earn yield.
     * Circle Agent Wallet signs and executes the transaction via MPC.
     */
    park(amount: number): Promise<{
        txHash: string;
        status: string;
    }>;
    /**
     * Instructs the Circle Agent Wallet to withdraw USDC from FloatVault back to the agent wallet.
     */
    withdraw(amount: number): Promise<{
        txHash: string;
        status: string;
    }>;
    /**
     * Gets the current deposited balance for this agent in the vault via public read RPC.
     */
    getBalance(): Promise<number>;
    /**
     * Returns current payment history list.
     */
    getTxHistory(): PaymentEvent[];
    /**
     * Intercepts and wraps a payment execution to guarantee reserve liquidity.
     */
    wrapPayment(paymentExecutor: (amount: number, recipient: string) => Promise<any>): (amount: number, recipient: string) => Promise<any>;
}
//# sourceMappingURL=FloatClient.d.ts.map