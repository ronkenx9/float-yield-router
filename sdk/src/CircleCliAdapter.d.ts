import { type AgentWalletClient } from './FloatClient.js';
/**
 * Circle CLI does not expose a per-call fee level on `circle wallet transfer`.
 * Stuck transactions are sped up via the separate `circle transaction accelerate <id>`
 * command. The feeLevel type is retained on the public surface as a forward-compat
 * hint that the SDK *uses* the accelerate path when a tx gets stuck, but it does
 * not influence the initial submission.
 */
export type FeeLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export interface CircleCliAdapterConfig {
    walletId?: string;
    walletAddress?: string;
    chain: string;
    /** ms to wait for tx to reach a terminal state before timing out. Default 60s. */
    confirmationTimeoutMs?: number;
    /** ms a pending tx may sit before we ask Circle to accelerate it. Default 15s. */
    accelerateThresholdMs?: number;
    /** Max `circle transaction accelerate` calls per transfer. Default 1. */
    maxAccelerateAttempts?: number;
    /** Poll interval while waiting for confirmation. Default 2000ms. */
    confirmationPollMs?: number;
    /** Suppress the proactive Terms Gate warning. */
    silenceTermsWarning?: boolean;
}
export interface TransferResult {
    /** Onchain transaction hash, available once Circle includes the tx. */
    txHash: string;
    /** Circle's internal transaction ID (UUID). Used for `circle transaction accelerate`. */
    txId: string;
    status: string;
    confirmationMs?: number;
    accelerateAttempts?: number;
}
export interface ContractExecuteResult {
    txHash: string;
    txId: string;
    status: string;
    confirmationMs?: number;
}
export declare class CircleCliAdapter implements AgentWalletClient {
    walletId: string;
    private walletAddress?;
    private chain;
    private confirmationTimeoutMs;
    private accelerateThresholdMs;
    private maxAccelerateAttempts;
    private confirmationPollMs;
    private termsChecked;
    private _txHashCache;
    rememberTxHash(txId: string, txHash: string): void;
    constructor(config: CircleCliAdapterConfig);
    /**
     * Proactively warn when running non-interactively without CIRCLE_ACCEPT_TERMS=1
     * AND the user has not yet accepted Terms on this host. If Terms are already
     * accepted, the env var is a no-op; we only print the warning when the gate
     * could actually deadlock the FLOAT loop.
     */
    private checkTermsGate;
    private runCommand;
    getAddress(): Promise<string>;
    getBalance(tokenAddress?: string): Promise<number>;
    /**
     * Look up a previously-submitted transaction by Circle ID via `circle transaction list`.
     * Returns the most recent matching record; falls back to UNKNOWN if not found.
     */
    getTransactionStatus(txId: string): Promise<{
        status: string;
        txHash?: string;
    }>;
    /**
     * Call an arbitrary smart-contract function from the agent wallet using
     * `circle wallet execute`. Handles confirmation polling and acceleration
     * the same way as transfer().
     *
     * @param contractAddress  - 0x address of the target contract
     * @param signature        - ABI function signature, e.g. "approve(address,uint256)"
     * @param args             - ordered ABI parameter values (as strings)
     * @param waitForConfirmation - block until COMPLETE/CONFIRMED or timeoutMs elapses
     * @param timeoutMs        - override default confirmationTimeoutMs
     * @param enableReplacement - call `circle transaction accelerate` if tx stalls
     */
    executeContract(params: {
        contractAddress: string;
        signature: string;
        args?: (string | number | bigint)[];
        waitForConfirmation?: boolean;
        timeoutMs?: number;
        enableReplacement?: boolean;
    }): Promise<ContractExecuteResult>;
    /**
     * Submit a transfer through Circle's CLI. The CLI returns the Circle transaction
     * ID immediately after broadcast; onchain confirmation is polled via
     * `circle transaction list`. Pass `waitForConfirmation: true` to block until
     * the tx is COMPLETE/CONFIRMED or `timeoutMs` elapses. If `enableReplacement`
     * is set and the tx stalls past `accelerateThresholdMs`, the SDK calls
     * `circle transaction accelerate` (Circle's native speed-up).
     */
    transfer(params: {
        amount: number;
        destinationAddress: string;
        tokenId?: string;
        feeLevel?: FeeLevel;
        waitForConfirmation?: boolean;
        timeoutMs?: number;
        enableReplacement?: boolean;
    }): Promise<TransferResult>;
    private submit;
    signTypedData(params: {
        data: string;
    }): Promise<{
        signature: string;
    }>;
}
//# sourceMappingURL=CircleCliAdapter.d.ts.map