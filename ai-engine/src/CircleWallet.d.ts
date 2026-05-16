/**
 * Wrapper for Circle's Programmable Wallets SDK.
 * Handles server-side signing of transactions on the Arc L1.
 */
export declare class CircleWallet {
    private walletId;
    private apiKey;
    constructor(walletId: string, apiKey: string);
    /**
     * Autonomously signs and broadcasts a transaction using the Developer-Controlled Wallet.
     */
    executeTransaction(to: string, data: string): Promise<string>;
}
//# sourceMappingURL=CircleWallet.d.ts.map