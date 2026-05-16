import { ethers, Contract } from 'ethers';
// Minimal ABI for FloatVault
const FLOAT_VAULT_ABI = [
    "function park(uint256 amount) external",
    "function withdraw(uint256 amount) external",
    "function deposits(address account) external view returns (uint256)",
    "function totalDeposits() external view returns (uint256)",
    "event Parked(address indexed agent, uint256 amount)",
    "event Withdrawn(address indexed agent, uint256 amount)"
];
// Minimal ABI for USDC/ERC20
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function mint(address to, uint256 amount) external" // For testing
];
export class FloatClient {
    vault;
    usdc;
    signer;
    constructor(config) {
        this.signer = config.signer;
        this.vault = new Contract(config.vaultAddress, FLOAT_VAULT_ABI, this.signer);
        this.usdc = new Contract(config.usdcAddress, ERC20_ABI, this.signer);
    }
    /**
     * Parks idle USDC into the FLOAT yield router.
     * Automatically handles approval if necessary.
     */
    async park(amount) {
        const owner = await this.signer.getAddress();
        const vaultAddr = await this.vault.getAddress();
        const allowance = await this.usdc.allowance(owner, vaultAddr);
        if (allowance < amount) {
            console.log(`Approving ${ethers.formatUnits(amount, 6)} USDC for FLOAT Vault...`);
            const tx = await this.usdc.approve(vaultAddr, ethers.MaxUint256);
            await tx.wait();
        }
        console.log(`Parking ${ethers.formatUnits(amount, 6)} USDC...`);
        const tx = await this.vault.park(amount);
        return tx.wait();
    }
    /**
     * Withdraws USDC instantly from the FLOAT yield router.
     */
    async withdraw(amount) {
        console.log(`Withdrawing ${ethers.formatUnits(amount, 6)} USDC...`);
        const tx = await this.vault.withdraw(amount);
        return tx.wait();
    }
    /**
     * Gets the current deposited balance for this agent.
     */
    async getBalance() {
        const owner = await this.signer.getAddress();
        return this.vault.deposits(owner);
    }
    /**
     * A wrapper that abstracts trading logic. Checks idle balance and parks it,
     * or withdraws it before executing a trade if liquid funds are too low.
     * This is a simplified "auto-pilot" demonstration.
     */
    async executeTradeWithAutoFloat(tradeExecution, requiredLiquidity) {
        const owner = await this.signer.getAddress();
        const liquidBalance = await this.usdc.balanceOf(owner);
        if (liquidBalance < requiredLiquidity) {
            const deficit = requiredLiquidity - liquidBalance;
            const parkedBalance = await this.getBalance();
            if (parkedBalance >= deficit) {
                console.log(`[FLOAT] Liquid deficit detected. Auto-withdrawing ${ethers.formatUnits(deficit, 6)} USDC...`);
                await this.withdraw(deficit);
            }
            else {
                console.warn(`[FLOAT] Warning: Insufficient parked balance to cover trade liquidity.`);
            }
        }
        // Execute the actual trade strategy
        await tradeExecution();
        // Post-trade: park any remaining idle liquidity
        const newLiquidBalance = await this.usdc.balanceOf(owner);
        if (newLiquidBalance > 0n) {
            console.log(`[FLOAT] Trade complete. Auto-parking ${ethers.formatUnits(newLiquidBalance, 6)} idle USDC...`);
            await this.park(newLiquidBalance);
        }
    }
}
//# sourceMappingURL=FloatClient.js.map