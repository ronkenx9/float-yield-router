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
        feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
        waitForConfirmation?: boolean;
        timeoutMs?: number;
        enableReplacement?: boolean;
    }): Promise<{
        txHash: string;
        status: string;
    }>;
    /**
     * Call an arbitrary smart-contract write function from the agent wallet.
     * Required for vault interactions (approve + park, withdraw) which are
     * contract calls, not simple token transfers.
     */
    executeContract(params: {
        contractAddress: string;
        signature: string;
        args?: (string | number | bigint)[];
        waitForConfirmation?: boolean;
        timeoutMs?: number;
        enableReplacement?: boolean;
    }): Promise<{
        txHash: string;
        status: string;
    }>;
    signTypedData?(params: {
        data: string;
    }): Promise<{
        signature: string;
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
    /** ms allowed for a recall to confirm before the payment is aborted. Default 30s. */
    recallConfirmationTimeoutMs?: number;
    /** If true, enable fee-bump replacement on stuck recall txs. Default true. */
    enableRecallReplacement?: boolean;
}
export interface WrapPaymentOptions {
    /** Bypass the per-hour recall rate limit. Required for EMERGENCY payments. */
    force?: boolean;
}
export declare class FloatClient {
    private vaultAddress;
    private usdcAddress;
    private agentWalletId;
    private circleCLI;
    private vaultContract;
    private liquidReserve;
    private maxRecallFrequencyPerHour;
    private recallConfirmationTimeoutMs;
    private enableRecallReplacement;
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
     * Convert a human-readable USDC amount to 6-decimal raw units (BigInt).
     * All FloatVault contract calls (park/withdraw) operate in raw units.
     */
    private toRawUsdc;
    /**
     * Parks idle USDC into the FloatVault by executing two contract calls:
     *   1. ERC-20 approve: grants FloatVault permission to pull `amount` USDC
     *   2. FloatVault.park(amount): vault calls transferFrom and credits deposits[agent]
     *
     * Both steps must succeed; approval is a best-effort prerequisite (re-approving
     * before every park is safe because we always approve the exact amount).
     */
    park(amount: number): Promise<{
        txHash: string;
        status: string;
    }>;
    /**
     * Recalls USDC from the FloatVault back to the agent wallet by executing
     * FloatVault.withdraw(rawAmount). The vault contract sends USDC directly to
     * msg.sender (the agent wallet). Waits for onchain confirmation.
     */
    withdraw(amount: number, opts?: {
        feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
        force?: boolean;
    }): Promise<{
        txHash: string;
        status: string;
    }>;
    /**
     * Recalls USDC from a source chain's vault and transfers it cross-chain to this
     * destination client's wallet instantly using Circle Gateway (<500ms mint).
     *
     * Steps:
     *   1. Withdraw USDC from the source vault (USYC vault) to the source wallet.
     *   2. Approve Gateway Wallet on the source chain to spend the USDC.
     *   3. Deposit USDC into the source Gateway Wallet.
     *   4. Construct and sign a Gateway burn intent (source chain -> destination chain).
     *   5. POST signed burn intent to the Gateway API for attestation + operator signature.
     *   6. Execute `gatewayMint` on the destination chain using the returned attestation.
     */
    gatewayRecall(params: {
        amount: number;
        sourceChain: string;
        sourceVaultAddress: string;
        sourceUsdcAddress: string;
        sourceCLI: AgentWalletClient;
        destinationChain: string;
    }): Promise<{
        txHash: string;
        status: string;
        latencyMs: number;
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
     * The wrapper:
     *   1. Checks liquid balance
     *   2. If deficit, awaits a confirmed recall from the vault (with replacement on stuck txs)
     *   3. Re-verifies liquid balance covers the payment
     *   4. Calls the user's paymentExecutor only if all the above succeed
     *
     * Recall rate limit is a hard limit. To bypass (e.g. EMERGENCY agent state),
     * pass `{ force: true }` as the third argument to the wrapped function.
     */
    wrapPayment(paymentExecutor: (amount: number, recipient: string) => Promise<any>): (amount: number, recipient: string, options?: WrapPaymentOptions) => Promise<any>;
}
//# sourceMappingURL=FloatClient.d.ts.map