import { ethers, type Signer } from 'ethers';
export interface FloatClientConfig {
    vaultAddress: string;
    usdcAddress: string;
    signer: Signer;
}
export declare class FloatClient {
    private vault;
    private usdc;
    private signer;
    constructor(config: FloatClientConfig);
    /**
     * Parks idle USDC into the FLOAT yield router.
     * Automatically handles approval if necessary.
     */
    park(amount: bigint): Promise<ethers.TransactionReceipt | null>;
    /**
     * Withdraws USDC instantly from the FLOAT yield router.
     */
    withdraw(amount: bigint): Promise<ethers.TransactionReceipt | null>;
    /**
     * Gets the current deposited balance for this agent.
     */
    getBalance(): Promise<bigint>;
    /**
     * A wrapper that abstracts trading logic. Checks idle balance and parks it,
     * or withdraws it before executing a trade if liquid funds are too low.
     * This is a simplified "auto-pilot" demonstration.
     */
    executeTradeWithAutoFloat(tradeExecution: () => Promise<void>, requiredLiquidity: bigint): Promise<void>;
}
//# sourceMappingURL=FloatClient.d.ts.map