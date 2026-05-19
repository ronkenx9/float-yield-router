import { FloatClient, type AgentWalletClient } from './FloatClient.js';
import { CircleCliAdapter } from './CircleCliAdapter.js';

/**
 * Simple wrapper for hackathon teams to float their trading agents.
 * 
 * Automatically manages idle USDC balances by parking them in the USYC vault
 * and recalling them when needed.
 */
export function wrapAgent(
  agent: { walletId: string; address?: string; chain: string },
  options: { strategy?: 'aggressive' | 'balanced' | 'conservative'; vault?: string } = {}
) {
  const chain = agent.chain.toLowerCase();
  
  // Map standard chains to their USDC contract addresses
  const USDC_ADDRESSES: Record<string, string> = {
    ethereum: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    base: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    avalanche: "0x5425890298aed601595a70AB815c96711a31Bc65",
    arc: "0x3600000000000000000000000000000000000000",
    arbitrum: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    optimism: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  };

  // Map standard vaults
  const VAULT_ADDRESSES: Record<string, string> = {
    usyc: "0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6", // USYC-backed vault
  };

  const usdcAddress = USDC_ADDRESSES[chain] || USDC_ADDRESSES.arc || "";
  const vaultAddress = VAULT_ADDRESSES[(options.vault || 'usyc').toLowerCase()] || VAULT_ADDRESSES.usyc || "";

  // Initialize the CLI adapter
  const adapter = new CircleCliAdapter({
    walletId: agent.walletId,
    ...(agent.address ? { walletAddress: agent.address } : {}),
    chain: agent.chain,
  });

  // Initialize the Float Client
  const client = new FloatClient({
    vaultAddress,
    usdcAddress,
    agentWalletId: agent.walletId,
    circleCLI: adapter,
    liquidReserve: options.strategy === 'aggressive' ? 0.40 : options.strategy === 'conservative' ? 0.55 : 0.35,
  });

  return {
    client,
    adapter,
    /**
     * Intercept a payment call and ensure it is covered by vault yields.
     */
    wrapPayment: (paymentExecutor: (amount: number, recipient: string) => Promise<any>) => {
      return client.wrapPayment(paymentExecutor);
    },
    /**
     * Park a manual amount of idle USDC into the yield vault.
     */
    park: (amount: number) => client.park(amount),
    /**
     * Withdraw manual amount of USDC back to the wallet.
     */
    withdraw: (amount: number) => client.withdraw(amount),
    /**
     * Recall cross-chain instantly via Circle Gateway.
     */
    gatewayRecall: (params: {
      amount: number;
      sourceChain: string;
      sourceVaultAddress: string;
      sourceUsdcAddress: string;
      sourceCLI: AgentWalletClient;
    }) => {
      return client.gatewayRecall({
        ...params,
        destinationChain: agent.chain,
      });
    }
  };
}
