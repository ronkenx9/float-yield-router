/**
 * CircleAgentAdapter — Circle Agent Wallet CLI wrapper for the FLOAT dashboard.
 *
 * Uses `circle wallet` CLI commands (exec'd as child processes) to interact with
 * the user's Circle Agent Wallet on ARC-TESTNET. No API keys or entity secrets
 * required — all auth is handled by the local Circle CLI session.
 *
 * Mirrors the CircleCliAdapter interface from the SDK (sdk/src/CircleCliAdapter.ts)
 * but is self-contained so the dashboard has no cross-package dependency.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ARC_USDC = '0x3600000000000000000000000000000000000000';
const ARC_RPC  = 'https://rpc.testnet.arc.network';
const USDC_DECIMALS = 6;

/**
 * Minimal direct JSON-RPC call to Arc Testnet.
 * Used for reads (balance, tx receipt) that don't need Circle's signer —
 * these are public chain state, so we bypass the CLI entirely.
 * Saves ~2s per call vs spawning `circle wallet balance` / `circle transaction list`.
 */
async function arcRpc(method: string, params: any[] = []): Promise<any> {
  const res = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Arc RPC ${method} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Arc RPC ${method}: ${json.error.message || JSON.stringify(json.error)}`);
  return json.result;
}

/**
 * Per-wallet CLI rate limiter.
 * Ensures a minimum gap of MIN_CLI_GAP_MS between consecutive `circle` calls
 * for the same wallet address, preventing HTTP 429s when multiple agents share
 * one wallet and call the CLI concurrently.
 *
 * NOTE: After the Arc-RPC migration (balance + tx-receipt now go direct to RPC),
 * the CLI is only hit for writes (submit) and the occasional first-time hash
 * discovery. 400ms is enough headroom for those rare calls.
 */
const MIN_CLI_GAP_MS = 400;
const _lastCliCallMs = new Map<string, number>();

async function acquireCliSlot(address: string): Promise<void> {
  const last = _lastCliCallMs.get(address) ?? 0;
  const wait = MIN_CLI_GAP_MS - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  _lastCliCallMs.set(address, Date.now());
}

/** Circle CLI transaction terminal states */
const TERMINAL_SUCCESS = new Set(['COMPLETE', 'CONFIRMED']);
const TERMINAL_FAILURE = new Set(['FAILED', 'CANCELLED', 'DENIED']);

export interface CircleAgentAdapterConfig {
  walletAddress: string;
  chain?: string;
  confirmationTimeoutMs?: number;
  accelerateThresholdMs?: number;
  maxAccelerateAttempts?: number;
  confirmationPollMs?: number;
}

export interface ContractExecuteResult {
  txHash: string;
  txId: string;
  status: string;
  confirmationMs?: number;
}

export class CircleAgentAdapter {
  public readonly walletAddress: string;
  private chain: string;
  private confirmationTimeoutMs: number;
  private accelerateThresholdMs: number;
  private maxAccelerateAttempts: number;
  private confirmationPollMs: number;

  constructor(config: CircleAgentAdapterConfig) {
    this.walletAddress = config.walletAddress;
    this.chain = (config.chain ?? 'ARC-TESTNET').toUpperCase();
    this.confirmationTimeoutMs = config.confirmationTimeoutMs ?? 90_000;
    this.accelerateThresholdMs = config.accelerateThresholdMs ?? 20_000;
    this.maxAccelerateAttempts = config.maxAccelerateAttempts ?? 1;
    this.confirmationPollMs = config.confirmationPollMs ?? 3_000;
  }

  private async runCommand(cmd: string): Promise<any> {
    await acquireCliSlot(this.walletAddress);
    try {
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    } catch (err: any) {
      const msg = `${err.stderr ?? ''} ${err.message ?? ''}`;
      if (msg.includes('Terms acceptance is required') || msg.includes('terms of service')) {
        throw new Error('[FLOAT] Circle CLI Terms gate hit. Run "circle terms accept" interactively.');
      }
      if (msg.includes('Not logged in') || msg.includes('AUTH_REQUIRED')) {
        throw new Error('[FLOAT] Circle CLI session expired. Re-run `circle wallet login --testnet`.');
      }
      throw new Error(`[FLOAT] Circle CLI command failed: ${err.stderr || err.message}`);
    }
  }

  async getAddress(): Promise<string> {
    return this.walletAddress;
  }

  /**
   * Returns the USDC balance of this wallet in human-readable units (6 decimals).
   */
  async getUSDCBalance(): Promise<number> {
    return this.getBalance(ARC_USDC);
  }

  async getBalance(tokenAddress?: string): Promise<number> {
    const token = tokenAddress ?? ARC_USDC;

    // Fast path: direct eth_call to ERC-20 balanceOf(address).
    // Bypasses Circle CLI subprocess (~2s) and the per-wallet rate limiter.
    // Selector 0x70a08231 = keccak256("balanceOf(address)").slice(0,4).
    try {
      const paddedAddr = this.walletAddress.slice(2).padStart(64, '0');
      const raw = await arcRpc('eth_call', [
        { to: token, data: `0x70a08231${paddedAddr}` },
        'latest',
      ]);
      const rawBalance = BigInt(raw || '0x0');
      return Number(rawBalance) / Math.pow(10, USDC_DECIMALS);
    } catch (rpcErr: any) {
      console.warn(`[FLOAT] Direct RPC balanceOf failed, falling back to CLI: ${rpcErr.message}`);
    }

    // Fallback path: original CLI lookup. Kept for safety if RPC is flaky.
    const result = await this.runCommand(
      `circle wallet balance --address ${this.walletAddress} --chain ${this.chain} --output json`
    );
    const balances: any[] = result?.data?.balances ?? [];
    const matched = balances.find(
      (b: any) =>
        b.tokenAddress?.toLowerCase() === token.toLowerCase() ||
        b.token?.symbol?.toUpperCase() === 'USDC'
    );
    return matched ? parseFloat(matched.amount) : 0;
  }

  /**
   * Cache mapping Circle txId → on-chain txHash.
   * Once we know the hash, all subsequent status polls go straight to Arc RPC
   * (eth_getTransactionReceipt) instead of spawning `circle transaction list`,
   * which drops poll latency from ~1–2s to ~100–200ms.
   */
  private _txHashCache: Map<string, string> = new Map();

  /** Seed the hash cache from a submission result so the first poll skips the CLI. */
  rememberTxHash(txId: string, txHash: string): void {
    if (txId && txHash) this._txHashCache.set(txId, txHash);
  }

  /**
   * Look up transaction status. Fast path uses direct eth_getTransactionReceipt
   * once the hash is known; slow path falls back to `circle transaction list`
   * to discover the hash on the first call.
   */
  async getTransactionStatus(txId: string): Promise<{ status: string; txHash?: string }> {
    // Fast path: known hash → ask the chain directly.
    const knownHash = this._txHashCache.get(txId);
    if (knownHash) {
      try {
        const receipt = await arcRpc('eth_getTransactionReceipt', [knownHash]);
        if (receipt === null || receipt === undefined) {
          // Submitted but not yet mined.
          return { status: 'PENDING', txHash: knownHash };
        }
        const success = receipt.status === '0x1' || receipt.status === 1;
        return { status: success ? 'COMPLETE' : 'FAILED', txHash: knownHash };
      } catch {
        // RPC failed — fall through to CLI as a safety net.
      }
    }

    // Slow path: ask Circle CLI to find the tx (and learn its hash for next time).
    try {
      const result = await this.runCommand(
        `circle transaction list --address ${this.walletAddress} --chain ${this.chain} --limit 50 --output json`
      );
      const txs: any[] = result?.data?.transactions ?? [];
      const match = txs.find((t: any) => t.id === txId);
      if (!match) return { status: 'UNKNOWN' };
      const status = (match.state || match.status || 'UNKNOWN').toUpperCase();
      const txHash = match.txHash || match.hash;
      if (txHash) this._txHashCache.set(txId, txHash);
      return { status, txHash };
    } catch {
      return { status: 'UNKNOWN' };
    }
  }

  /**
   * Poll a submitted txId until terminal or timeout.
   * Calls `circle transaction accelerate` if stuck past accelerateThresholdMs.
   */
  private async waitForTx(txId: string, timeoutMs: number, enableAccelerate = true): Promise<ContractExecuteResult> {
    const startedAt = Date.now();
    let accelerateAttempts = 0;
    let lastAccelerateAt = 0;

    while (Date.now() - startedAt < timeoutMs) {
      const status = await this.getTransactionStatus(txId);
      const upper = status.status.toUpperCase();

      if (TERMINAL_SUCCESS.has(upper)) {
        return {
          txHash: status.txHash ?? '',
          txId,
          status: 'COMPLETE',
          confirmationMs: Date.now() - startedAt,
        };
      }

      if (TERMINAL_FAILURE.has(upper)) {
        throw new Error(`[FLOAT] Transaction ${txId} terminated with status ${upper}.`);
      }

      const sinceLastAccelerate = Date.now() - (lastAccelerateAt || startedAt);
      const isStuck = upper === 'STUCK' || sinceLastAccelerate > this.accelerateThresholdMs;
      if (enableAccelerate && isStuck && accelerateAttempts < this.maxAccelerateAttempts) {
        accelerateAttempts++;
        console.warn(`[FLOAT] TX ${txId} stuck — accelerating (attempt ${accelerateAttempts}).`);
        try {
          await this.runCommand(
            `circle transaction accelerate ${txId} --address ${this.walletAddress} --chain ${this.chain} --output json`
          );
          lastAccelerateAt = Date.now();
        } catch (e: any) {
          console.warn(`[FLOAT] Accelerate failed (continuing): ${e.message}`);
        }
      }

      await sleep(this.confirmationPollMs);
    }

    throw new Error(`[FLOAT] Transaction ${txId} did not confirm within ${timeoutMs}ms.`);
  }

  /**
   * Execute a contract function from the agent wallet.
   * Uses `circle wallet execute "<sig>" <args...> --contract <addr>`.
   */
  async executeContract(params: {
    contractAddress: string;
    signature: string;
    args?: (string | number | bigint)[];
    waitForConfirmation?: boolean;
    timeoutMs?: number;
    enableReplacement?: boolean;
  }): Promise<ContractExecuteResult> {
    const argStr = (params.args ?? []).map(a => String(a)).join(' ');
    const cmd =
      `circle wallet execute "${params.signature}" ${argStr} ` +
      `--contract ${params.contractAddress} --address ${this.walletAddress} ` +
      `--chain ${this.chain} --output json`;

    console.log(`[FLOAT CLI] ${cmd}`);
    const result = await this.runCommand(cmd);

    const tx = result?.data?.transaction ?? result?.data ?? {};
    const submission: ContractExecuteResult = {
      txHash: tx.txHash ?? tx.hash ?? '',
      txId: tx.id ?? tx.transactionId ?? '',
      status: (tx.state ?? tx.status ?? 'PENDING').toUpperCase(),
    };

    // Seed the hash cache so the first confirmation poll skips the CLI entirely.
    if (submission.txId && submission.txHash) {
      this.rememberTxHash(submission.txId, submission.txHash);
    }

    if (!params.waitForConfirmation) return submission;

    return this.waitForTx(
      submission.txId,
      params.timeoutMs ?? this.confirmationTimeoutMs,
      params.enableReplacement !== false,
    );
  }

  /**
   * Transfer tokens from this wallet to a destination address.
   */
  async transfer(params: {
    amount: number;
    destinationAddress: string;
    waitForConfirmation?: boolean;
    timeoutMs?: number;
    enableReplacement?: boolean;
  }): Promise<ContractExecuteResult> {
    const cmd =
      `circle wallet transfer ${params.destinationAddress} --amount ${params.amount} ` +
      `--address ${this.walletAddress} --chain ${this.chain} --output json`;

    console.log(`[FLOAT CLI] ${cmd}`);
    const result = await this.runCommand(cmd);

    const tx = result?.data?.transaction ?? result?.data ?? {};
    const submission: ContractExecuteResult = {
      txHash: tx.txHash ?? tx.hash ?? '',
      txId: tx.id ?? tx.transactionId ?? '',
      status: (tx.state ?? tx.status ?? 'PENDING').toUpperCase(),
    };

    // Seed the hash cache so the first confirmation poll skips the CLI entirely.
    if (submission.txId && submission.txHash) {
      this.rememberTxHash(submission.txId, submission.txHash);
    }

    if (!params.waitForConfirmation) return submission;

    return this.waitForTx(
      submission.txId,
      params.timeoutMs ?? this.confirmationTimeoutMs,
      params.enableReplacement !== false,
    );
  }

  async signTypedData(params: { data: string }): Promise<{ signature: string }> {
    const escapedData = params.data.replace(/'/g, "'\\''");
    const cmd = `circle wallet sign typed-data '${escapedData}' --address ${this.walletAddress} --chain ${this.chain} --output json`;
    console.log(`[FLOAT CLI] ${cmd.replace(escapedData, '...')}`);
    const result = await this.runCommand(cmd);
    const signature = result?.data?.signature || result?.signature || '';
    if (!signature) {
      throw new Error(`[FLOAT] Failed to sign typed data: no signature in output: ${JSON.stringify(result)}`);
    }
    return { signature };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
