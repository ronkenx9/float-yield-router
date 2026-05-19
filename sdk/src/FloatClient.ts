import { ethers, Contract } from 'ethers';

// Minimal ABI for FloatVault (read-only view queries)
const FLOAT_VAULT_ABI = [
  "function deposits(address account) external view returns (uint256)",
  "function totalDeposits() external view returns (uint256)",
];

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
  }): Promise<{ txHash: string; status: string }>;
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
  }): Promise<{ txHash: string; status: string }>;
  signTypedData?(params: {
    data: string;
  }): Promise<{ signature: string }>;
}

export interface FloatClientConfig {
  vaultAddress: string;
  usdcAddress: string;
  agentWalletId: string;
  circleCLI: AgentWalletClient;
  rpcUrl?: string;
  liquidReserve?: 'adaptive' | number | { ratio: number };
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

export class FloatClient {
  private vaultAddress: string;
  private usdcAddress: string;
  private agentWalletId: string;
  private circleCLI: AgentWalletClient;
  private vaultContract: any;
  private liquidReserve: 'adaptive' | number | { ratio: number };
  private maxRecallFrequencyPerHour: number;
  private recallConfirmationTimeoutMs: number;
  private enableRecallReplacement: boolean;
  private txHistory: PaymentEvent[] = [];
  private recallHistory: number[] = [];

  constructor(config: FloatClientConfig) {
    this.vaultAddress = config.vaultAddress;
    this.usdcAddress = config.usdcAddress;
    this.agentWalletId = config.agentWalletId;
    this.circleCLI = config.circleCLI;
    this.liquidReserve = config.liquidReserve ?? 'adaptive';
    this.maxRecallFrequencyPerHour = config.maxRecallFrequencyPerHour ?? 2;
    this.recallConfirmationTimeoutMs = config.recallConfirmationTimeoutMs ?? 30_000;
    this.enableRecallReplacement = config.enableRecallReplacement ?? true;

    const providerUrl = config.rpcUrl ?? 'https://rpc.testnet.arc.network';
    const readOnlyProvider = new ethers.JsonRpcProvider(providerUrl);
    this.vaultContract = new Contract(this.vaultAddress, FLOAT_VAULT_ABI, readOnlyProvider);
  }

  /**
   * Computes the target liquid reserve based on current configuration and spend history.
   */
  async calculateTargetReserve(totalBalance: number): Promise<{ reserve: number; mode: string; samplesNeeded?: number }> {
    if (typeof this.liquidReserve === 'number') {
      return { reserve: this.liquidReserve, mode: 'static' };
    }

    if (typeof this.liquidReserve === 'object' && this.liquidReserve !== null && 'ratio' in this.liquidReserve) {
      return { reserve: totalBalance * this.liquidReserve.ratio, mode: 'ratio' };
    }

    if (this.liquidReserve === 'adaptive') {
      const MIN_SAMPLE_SIZE = 10;

      if (this.txHistory.length < MIN_SAMPLE_SIZE) {
        return {
          reserve: totalBalance * 0.5,
          mode: 'bootstrap',
          samplesNeeded: MIN_SAMPLE_SIZE - this.txHistory.length
        };
      }

      const sizes = this.txHistory.map(tx => tx.amount);
      const avgSize = sizes.reduce((sum, val) => sum + val, 0) / sizes.length;

      const intervals: number[] = [];
      for (let i = 1; i < this.txHistory.length; i++) {
        const t1 = this.txHistory[i - 1]?.timestamp;
        const t2 = this.txHistory[i]?.timestamp;
        if (t1 && t2) {
          intervals.push(Math.abs(new Date(t2).getTime() - new Date(t1).getTime()) / 3600000);
        }
      }

      if (intervals.length === 0) {
        return { reserve: avgSize, mode: 'adaptive' };
      }

      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const squaredDiffs = intervals.map(val => Math.pow(val - avgInterval, 2));
      const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
      const stdDevInterval = Math.sqrt(variance);

      const calculatedReserve = avgSize + 1.5 * stdDevInterval;
      const finalReserve = Math.max(1.0, Math.min(calculatedReserve, totalBalance * 0.9));

      return { reserve: finalReserve, mode: 'adaptive' };
    }

    return { reserve: totalBalance * 0.3, mode: 'default' };
  }

  /**
   * Convert a human-readable USDC amount to 6-decimal raw units (BigInt).
   * All FloatVault contract calls (park/withdraw) operate in raw units.
   */
  private toRawUsdc(amount: number): bigint {
    // Multiply by 1e6 and round to avoid floating-point drift.
    return BigInt(Math.round(amount * 1_000_000));
  }

  /**
   * Parks idle USDC into the FloatVault by executing two contract calls:
   *   1. ERC-20 approve: grants FloatVault permission to pull `amount` USDC
   *   2. FloatVault.park(amount): vault calls transferFrom and credits deposits[agent]
   *
   * Both steps must succeed; approval is a best-effort prerequisite (re-approving
   * before every park is safe because we always approve the exact amount).
   */
  async park(amount: number): Promise<{ txHash: string; status: string }> {
    console.log(`[FLOAT] Parking $${amount.toFixed(2)} USDC into vault (approve + park)...`);
    const rawAmount = this.toRawUsdc(amount);

    // Step 1: approve vault to spend exactly `rawAmount`
    await this.circleCLI.executeContract({
      contractAddress: this.usdcAddress,
      signature: 'approve(address,uint256)',
      args: [this.vaultAddress, rawAmount],
      waitForConfirmation: true,
      timeoutMs: this.recallConfirmationTimeoutMs,
      enableReplacement: this.enableRecallReplacement,
    });

    // Step 2: vault.park(rawAmount) — pulls USDC via transferFrom, credits deposits
    console.log(`[FLOAT] Executing FloatVault.park(${rawAmount}) for $${amount.toFixed(2)} USDC...`);
    return this.circleCLI.executeContract({
      contractAddress: this.vaultAddress,
      signature: 'park(uint256)',
      args: [rawAmount],
      waitForConfirmation: true,
      timeoutMs: this.recallConfirmationTimeoutMs,
      enableReplacement: this.enableRecallReplacement,
    });
  }

  /**
   * Recalls USDC from the FloatVault back to the agent wallet by executing
   * FloatVault.withdraw(rawAmount). The vault contract sends USDC directly to
   * msg.sender (the agent wallet). Waits for onchain confirmation.
   */
  async withdraw(amount: number, opts?: { feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH'; force?: boolean }): Promise<{ txHash: string; status: string }> {
    console.log(`[FLOAT] Recalling $${amount.toFixed(2)} USDC from vault (withdraw)...`);
    const rawAmount = this.toRawUsdc(amount);
    return this.circleCLI.executeContract({
      contractAddress: this.vaultAddress,
      signature: 'withdraw(uint256)',
      args: [rawAmount],
      waitForConfirmation: true,
      timeoutMs: this.recallConfirmationTimeoutMs,
      enableReplacement: this.enableRecallReplacement,
    });
  }

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
  async gatewayRecall(params: {
    amount: number;
    sourceChain: string;
    sourceVaultAddress: string;
    sourceUsdcAddress: string;
    sourceCLI: AgentWalletClient;
    destinationChain: string;
  }): Promise<{ txHash: string; status: string; latencyMs: number }> {
    const startedAt = Date.now();
    const sourceChain = params.sourceChain.toLowerCase();
    const destChain = params.destinationChain.toLowerCase();

    const GATEWAY_DOMAINS: Record<string, number> = {
      ethereum: 0,
      avalanche: 1,
      optimism: 2,
      arbitrum: 3,
      solana: 5,
      base: 6,
      polygon: 7,
      unichain: 10,
      arc: 26,
    };

    const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
    const GATEWAY_MINTER_ADDRESS = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";

    const sourceDomain = GATEWAY_DOMAINS[sourceChain];
    const destDomain = GATEWAY_DOMAINS[destChain];

    if (sourceDomain === undefined || destDomain === undefined) {
      throw new Error(`[FLOAT] Unsupported source (${sourceChain}) or destination (${destChain}) chain for Gateway.`);
    }

    const rawAmount = this.toRawUsdc(params.amount);
    const sourceAddress = await params.sourceCLI.getAddress();
    const destAddress = await this.circleCLI.getAddress();

    console.log(`[FLOAT GATEWAY] Starting cross-chain recall: $${params.amount.toFixed(2)} USDC from ${sourceChain} (Vault: ${params.sourceVaultAddress}) -> ${destChain} (Wallet: ${destAddress})`);

    // Step 1: Withdraw from source vault
    console.log(`[FLOAT GATEWAY] [1/6] Withdrawing from vault on ${sourceChain}...`);
    await params.sourceCLI.executeContract({
      contractAddress: params.sourceVaultAddress,
      signature: 'withdraw(uint256)',
      args: [rawAmount],
      waitForConfirmation: true,
      timeoutMs: this.recallConfirmationTimeoutMs,
      enableReplacement: this.enableRecallReplacement,
    });

    // Step 2: Approve Gateway Wallet on source chain
    console.log(`[FLOAT GATEWAY] [2/6] Approving Gateway Wallet on ${sourceChain}...`);
    await params.sourceCLI.executeContract({
      contractAddress: params.sourceUsdcAddress,
      signature: 'approve(address,uint256)',
      args: [GATEWAY_WALLET_ADDRESS, rawAmount],
      waitForConfirmation: true,
      timeoutMs: this.recallConfirmationTimeoutMs,
      enableReplacement: this.enableRecallReplacement,
    });

    // Step 3: Deposit into Gateway Wallet on source chain
    console.log(`[FLOAT GATEWAY] [3/6] Depositing into Gateway Wallet on ${sourceChain}...`);
    await params.sourceCLI.executeContract({
      contractAddress: GATEWAY_WALLET_ADDRESS,
      signature: 'deposit(address,uint256)',
      args: [params.sourceUsdcAddress, rawAmount],
      waitForConfirmation: true,
      timeoutMs: this.recallConfirmationTimeoutMs,
      enableReplacement: this.enableRecallReplacement,
    });

    // Step 4: Construct and sign burn intent
    console.log(`[FLOAT GATEWAY] [4/6] Constructing and signing Gateway burn intent...`);
    const salt = "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    
    const helperAddressToBytes32 = (addr: string) => 
      ("0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0"));

    const burnIntent = {
      maxBlockHeight: ((1n << 256n) - 1n).toString(),
      maxFee: "2010000",
      spec: {
        version: 1,
        sourceDomain,
        destinationDomain: destDomain,
        sourceContract: GATEWAY_WALLET_ADDRESS,
        destinationContract: GATEWAY_MINTER_ADDRESS,
        sourceToken: params.sourceUsdcAddress,
        destinationToken: this.usdcAddress,
        sourceDepositor: sourceAddress,
        destinationRecipient: destAddress,
        sourceSigner: sourceAddress,
        destinationCaller: "0x0000000000000000000000000000000000000000",
        value: rawAmount.toString(),
        salt,
        hookData: "0x",
      }
    };

    const typedData = {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
        ],
        TransferSpec: [
          { name: "version", type: "uint32" },
          { name: "sourceDomain", type: "uint32" },
          { name: "destinationDomain", type: "uint32" },
          { name: "sourceContract", type: "bytes32" },
          { name: "destinationContract", type: "bytes32" },
          { name: "sourceToken", type: "bytes32" },
          { name: "destinationToken", type: "bytes32" },
          { name: "sourceDepositor", type: "bytes32" },
          { name: "destinationRecipient", type: "bytes32" },
          { name: "sourceSigner", type: "bytes32" },
          { name: "destinationCaller", type: "bytes32" },
          { name: "value", type: "uint256" },
          { name: "salt", type: "bytes32" },
          { name: "hookData", type: "bytes" },
        ],
        BurnIntent: [
          { name: "maxBlockHeight", type: "uint256" },
          { name: "maxFee", type: "uint256" },
          { name: "spec", type: "TransferSpec" },
        ]
      },
      domain: { name: "GatewayWallet", version: "1" },
      primaryType: "BurnIntent",
      message: {
        maxBlockHeight: burnIntent.maxBlockHeight,
        maxFee: burnIntent.maxFee,
        spec: {
          version: burnIntent.spec.version,
          sourceDomain: burnIntent.spec.sourceDomain,
          destinationDomain: burnIntent.spec.destinationDomain,
          sourceContract: helperAddressToBytes32(burnIntent.spec.sourceContract),
          destinationContract: helperAddressToBytes32(burnIntent.spec.destinationContract),
          sourceToken: helperAddressToBytes32(burnIntent.spec.sourceToken),
          destinationToken: helperAddressToBytes32(burnIntent.spec.destinationToken),
          sourceDepositor: helperAddressToBytes32(burnIntent.spec.sourceDepositor),
          destinationRecipient: helperAddressToBytes32(burnIntent.spec.destinationRecipient),
          sourceSigner: helperAddressToBytes32(burnIntent.spec.sourceSigner),
          destinationCaller: helperAddressToBytes32(burnIntent.spec.destinationCaller),
          value: burnIntent.spec.value,
          salt: burnIntent.spec.salt,
          hookData: burnIntent.spec.hookData,
        }
      }
    };

    if (typeof params.sourceCLI.signTypedData !== 'function') {
      throw new Error(`[FLOAT] Source AgentWalletClient does not support signTypedData.`);
    }

    const sigResp = await params.sourceCLI.signTypedData({
      data: JSON.stringify(typedData),
    });

    const signature = sigResp.signature;

    // Step 5: Request attestation from Gateway API
    console.log(`[FLOAT GATEWAY] [5/6] Requesting attestation from Gateway API...`);
    const requestPayload = [
      {
        burnIntent: typedData.message,
        signature,
      }
    ];

    const response = await fetch("https://gateway-api-testnet.circle.com/v1/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[FLOAT GATEWAY] API error: ${response.status} - ${errText}`);
    }

    const responseJson = await response.json() as { attestation: string; signature: string };
    const attestation = responseJson.attestation;
    const operatorSig = responseJson.signature;

    if (!attestation || !operatorSig) {
      throw new Error(`[FLOAT GATEWAY] Invalid API response: missing attestation or signature`);
    }

    // Step 6: Mint on destination chain
    console.log(`[FLOAT GATEWAY] [6/6] Minting USDC on destination chain (${destChain})...`);
    const mintResult = await this.circleCLI.executeContract({
      contractAddress: GATEWAY_MINTER_ADDRESS,
      signature: "gatewayMint(bytes,bytes)",
      args: [attestation, operatorSig],
      waitForConfirmation: true,
      timeoutMs: this.recallConfirmationTimeoutMs,
      enableReplacement: this.enableRecallReplacement,
    });

    const latencyMs = Date.now() - startedAt;
    console.log(`[FLOAT GATEWAY] Cross-chain recall successful! Mint txHash: ${mintResult.txHash} | Latency: ${latencyMs}ms`);

    return {
      txHash: mintResult.txHash,
      status: "COMPLETE",
      latencyMs,
    };
  }

  /**
   * Gets the current deposited balance for this agent in the vault via public read RPC.
   */
  async getBalance(): Promise<number> {
    const owner = await this.circleCLI.getAddress();
    const balance = await this.vaultContract.deposits(owner);
    return Number(ethers.formatUnits(balance, 6));
  }

  /**
   * Returns current payment history list.
   */
  getTxHistory(): PaymentEvent[] {
    return this.txHistory;
  }

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
  wrapPayment(paymentExecutor: (amount: number, recipient: string) => Promise<any>) {
    return async (amount: number, recipient: string, options?: WrapPaymentOptions): Promise<any> => {
      const force = options?.force === true;
      const owner = await this.circleCLI.getAddress();
      const liquidBalance = await this.circleCLI.getBalance(this.usdcAddress);

      const rawParked = await this.vaultContract.deposits(owner);
      const parkedBalance = Number(ethers.formatUnits(rawParked, 6));

      this.txHistory.push({
        timestamp: new Date().toISOString(),
        amount,
      });
      if (this.txHistory.length > 100) {
        this.txHistory.shift();
      }

      if (liquidBalance < amount) {
        const deficit = amount - liquidBalance;
        if (parkedBalance < deficit) {
          throw new Error(
            `[FLOAT] Insufficient funds: Liquid ($${liquidBalance.toFixed(2)}) + Parked ` +
            `($${parkedBalance.toFixed(2)}) cannot cover payment ($${amount.toFixed(2)})`
          );
        }

        const now = Date.now();
        this.recallHistory = this.recallHistory.filter(t => now - t < 3600000);

        if (this.recallHistory.length >= this.maxRecallFrequencyPerHour && !force) {
          throw new Error(
            `[FLOAT] Recall rate limit exceeded (${this.recallHistory.length}/${this.maxRecallFrequencyPerHour} in last hour). ` +
            `Pass { force: true } from an EMERGENCY context to override, or increase maxRecallFrequencyPerHour.`
          );
        }
        if (this.recallHistory.length >= this.maxRecallFrequencyPerHour && force) {
          console.warn(
            `[FLOAT] Recall rate limit overridden by force=true. Inspect upstream logic — ` +
            `runaway recalls may indicate a misconfigured reserve or stuck integration.`
          );
        }

        console.log(`[FLOAT] Liquid reserve deficit detected. Recalling $${deficit.toFixed(2)} USDC (force=${force})...`);
        await this.withdraw(deficit, { force });
        this.recallHistory.push(now);

        // Re-verify: the recall confirmed onchain, but balance read goes via Circle CLI which
        // may have its own caching layer. Refuse to proceed if the wallet doesn't report enough.
        const liquidAfter = await this.circleCLI.getBalance(this.usdcAddress);
        if (liquidAfter + 1e-6 < amount) {
          throw new Error(
            `[FLOAT] Recall confirmed onchain but wallet balance still reports ` +
            `$${liquidAfter.toFixed(6)} < $${amount.toFixed(6)}. Aborting payment to prevent failure.`
          );
        }
      }

      return paymentExecutor(amount, recipient);
    };
  }
}
