import { FloatClient, type AgentWalletClient } from './FloatClient.js';
import { CircleCliAdapter } from './CircleCliAdapter.js';
/**
 * Simple wrapper for hackathon teams to float their trading agents.
 *
 * Automatically manages idle USDC balances by parking them in the USYC vault
 * and recalling them when needed.
 */
export declare function wrapAgent(agent: {
    walletId: string;
    address?: string;
    chain: string;
}, options?: {
    strategy?: 'aggressive' | 'balanced' | 'conservative';
    vault?: string;
}): {
    client: FloatClient;
    adapter: CircleCliAdapter;
    /**
     * Intercept a payment call and ensure it is covered by vault yields.
     */
    wrapPayment: (paymentExecutor: (amount: number, recipient: string) => Promise<any>) => (amount: number, recipient: string, options?: import("./FloatClient.js").WrapPaymentOptions) => Promise<any>;
    /**
     * Park a manual amount of idle USDC into the yield vault.
     */
    park: (amount: number) => Promise<{
        txHash: string;
        status: string;
    }>;
    /**
     * Withdraw manual amount of USDC back to the wallet.
     */
    withdraw: (amount: number) => Promise<{
        txHash: string;
        status: string;
    }>;
    /**
     * Recall cross-chain instantly via Circle Gateway.
     */
    gatewayRecall: (params: {
        amount: number;
        sourceChain: string;
        sourceVaultAddress: string;
        sourceUsdcAddress: string;
        sourceCLI: AgentWalletClient;
    }) => Promise<{
        txHash: string;
        status: string;
        latencyMs: number;
    }>;
};
//# sourceMappingURL=wrapAgent.d.ts.map