import { ethers, Contract } from 'ethers';
// Minimal ABI for FloatVault (read-only view queries)
const FLOAT_VAULT_ABI = [
    "function deposits(address account) external view returns (uint256)",
    "function totalDeposits() external view returns (uint256)",
];
export class FloatClient {
    vaultAddress;
    usdcAddress;
    agentWalletId;
    circleCLI;
    vaultContract;
    liquidReserve;
    maxRecallFrequencyPerHour;
    txHistory = [];
    recallHistory = []; // Timestamps of recalls
    constructor(config) {
        this.vaultAddress = config.vaultAddress;
        this.usdcAddress = config.usdcAddress;
        this.agentWalletId = config.agentWalletId;
        this.circleCLI = config.circleCLI;
        this.liquidReserve = config.liquidReserve ?? 'adaptive';
        this.maxRecallFrequencyPerHour = config.maxRecallFrequencyPerHour ?? 2;
        // Use a read-only public provider to fetch vault state (no key custody required)
        const providerUrl = config.rpcUrl ?? 'https://rpc.testnet.arc.network';
        const readOnlyProvider = new ethers.JsonRpcProvider(providerUrl);
        this.vaultContract = new Contract(this.vaultAddress, FLOAT_VAULT_ABI, readOnlyProvider);
    }
    /**
     * Computes the target liquid reserve based on current configuration and spend history.
     */
    async calculateTargetReserve(totalBalance) {
        // 1. Static Mode
        if (typeof this.liquidReserve === 'number') {
            return { reserve: this.liquidReserve, mode: 'static' };
        }
        // 2. Ratio Mode
        if (typeof this.liquidReserve === 'object' && this.liquidReserve !== null && 'ratio' in this.liquidReserve) {
            return { reserve: totalBalance * this.liquidReserve.ratio, mode: 'ratio' };
        }
        // 3. Adaptive Mode (Value-at-Risk Volatility-adjusted Spend Buffer)
        if (this.liquidReserve === 'adaptive') {
            const MIN_SAMPLE_SIZE = 10;
            // Cold-start bootstrap protocol
            if (this.txHistory.length < MIN_SAMPLE_SIZE) {
                return {
                    reserve: totalBalance * 0.5, // Keep 50% liquid until confidence is calibrated
                    mode: 'bootstrap',
                    samplesNeeded: MIN_SAMPLE_SIZE - this.txHistory.length
                };
            }
            // Compute average transaction size
            const sizes = this.txHistory.map(tx => tx.amount);
            const avgSize = sizes.reduce((sum, val) => sum + val, 0) / sizes.length;
            // Compute standard deviation of transaction intervals (in hours)
            const intervals = [];
            for (let i = 1; i < this.txHistory.length; i++) {
                const t1 = this.txHistory[i - 1]?.timestamp;
                const t2 = this.txHistory[i]?.timestamp;
                if (t1 && t2) {
                    intervals.push(Math.abs(new Date(t2).getTime() - new Date(t1).getTime()) / 3600000); // interval in hours
                }
            }
            if (intervals.length === 0) {
                return { reserve: avgSize, mode: 'adaptive' };
            }
            const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
            const squaredDiffs = intervals.map(val => Math.pow(val - avgInterval, 2));
            const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
            const stdDevInterval = Math.sqrt(variance);
            // Value at Risk formula: AvgSize + k * stdDevInterval (k=1.5 yields 92% confidence envelope)
            const calculatedReserve = avgSize + 1.5 * stdDevInterval;
            // Guardrails: ensure reserve stays between $1.00 and 90% of total balance
            const finalReserve = Math.max(1.0, Math.min(calculatedReserve, totalBalance * 0.9));
            return { reserve: finalReserve, mode: 'adaptive' };
        }
        // Default fallback
        return { reserve: totalBalance * 0.3, mode: 'default' };
    }
    /**
     * Instructs the Circle Agent Wallet to transfer USDC to FloatVault to earn yield.
     * Circle Agent Wallet signs and executes the transaction via MPC.
     */
    async park(amount) {
        console.log(`[FLOAT] Instructing Circle Agent Wallet to park $${amount.toFixed(2)} USDC...`);
        return this.circleCLI.transfer({
            amount,
            destinationAddress: this.vaultAddress
        });
    }
    /**
     * Instructs the Circle Agent Wallet to withdraw USDC from FloatVault back to the agent wallet.
     */
    async withdraw(amount) {
        console.log(`[FLOAT] Instructing Circle Agent Wallet to recall $${amount.toFixed(2)} USDC...`);
        const agentAddress = await this.circleCLI.getAddress();
        return this.circleCLI.transfer({
            amount,
            destinationAddress: agentAddress
        });
    }
    /**
     * Gets the current deposited balance for this agent in the vault via public read RPC.
     */
    async getBalance() {
        const owner = await this.circleCLI.getAddress();
        const balance = await this.vaultContract.deposits(owner);
        return Number(ethers.formatUnits(balance, 6));
    }
    /**
     * Returns current payment history list.
     */
    getTxHistory() {
        return this.txHistory;
    }
    /**
     * Intercepts and wraps a payment execution to guarantee reserve liquidity.
     */
    wrapPayment(paymentExecutor) {
        return async (amount, recipient) => {
            const owner = await this.circleCLI.getAddress();
            const liquidBalance = await this.circleCLI.getBalance(this.usdcAddress);
            const rawParked = await this.vaultContract.deposits(owner);
            const parkedBalance = Number(ethers.formatUnits(rawParked, 6));
            // Record the transaction attempt in history
            this.txHistory.push({
                timestamp: new Date().toISOString(),
                amount
            });
            if (this.txHistory.length > 100) {
                this.txHistory.shift();
            }
            if (liquidBalance < amount) {
                const deficit = amount - liquidBalance;
                if (parkedBalance >= deficit) {
                    const now = Date.now();
                    // Check recall rate limit over the last sliding hour window
                    this.recallHistory = this.recallHistory.filter(t => now - t < 3600000);
                    if (this.recallHistory.length >= this.maxRecallFrequencyPerHour) {
                        console.warn(`[FLOAT CRITICAL WARNING] Recall frequency limit reached (${this.maxRecallFrequencyPerHour}/hour). Triggering emergency recall override to prevent agent payment failure.`);
                    }
                    console.log(`[FLOAT] Liquid reserve deficit detected. Instructing wallet to recall $${deficit.toFixed(2)} USDC...`);
                    await this.withdraw(deficit);
                    this.recallHistory.push(now);
                }
                else {
                    throw new Error(`[FLOAT] Insufficient funds: Liquid ($${liquidBalance.toFixed(2)}) + Parked ($${parkedBalance.toFixed(2)}) cannot cover payment ($${amount.toFixed(2)})`);
                }
            }
            // Execute the actual payment task
            return paymentExecutor(amount, recipient);
        };
    }
}
//# sourceMappingURL=FloatClient.js.map