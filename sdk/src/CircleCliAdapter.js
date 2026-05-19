import { exec } from 'child_process';
import { promisify } from 'util';
import {} from './FloatClient.js';
const execAsync = promisify(exec);
const ARC_USDC = '0x3600000000000000000000000000000000000000';
const ARC_RPC = 'https://rpc.testnet.arc.network';
const USDC_DECIMALS = 6;
async function arcRpc(method, params = []) {
    const res = await fetch(ARC_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok)
        throw new Error(`Arc RPC ${method} HTTP ${res.status}`);
    const json = (await res.json());
    if (json.error)
        throw new Error(`Arc RPC ${method}: ${json.error.message || JSON.stringify(json.error)}`);
    return json.result;
}
function isNonInteractive() {
    return !process.stdin.isTTY;
}
/** Circle CLI transaction states. */
const TERMINAL_SUCCESS = new Set(['COMPLETE', 'CONFIRMED']);
const TERMINAL_FAILURE = new Set(['FAILED', 'CANCELLED', 'DENIED']);
export class CircleCliAdapter {
    walletId;
    walletAddress;
    chain;
    confirmationTimeoutMs;
    accelerateThresholdMs;
    maxAccelerateAttempts;
    confirmationPollMs;
    termsChecked = false;
    _txHashCache = new Map();
    rememberTxHash(txId, txHash) {
        if (txId && txHash) {
            this._txHashCache.set(txId, txHash);
        }
    }
    constructor(config) {
        this.walletId = config.walletId || '';
        if (config.walletAddress !== undefined) {
            this.walletAddress = config.walletAddress;
        }
        this.chain = config.chain.toUpperCase();
        this.confirmationTimeoutMs = config.confirmationTimeoutMs ?? 60_000;
        this.accelerateThresholdMs = config.accelerateThresholdMs ?? 15_000;
        this.maxAccelerateAttempts = config.maxAccelerateAttempts ?? 1;
        this.confirmationPollMs = config.confirmationPollMs ?? 2_000;
        this.checkTermsGate(config.silenceTermsWarning === true);
    }
    /**
     * Proactively warn when running non-interactively without CIRCLE_ACCEPT_TERMS=1
     * AND the user has not yet accepted Terms on this host. If Terms are already
     * accepted, the env var is a no-op; we only print the warning when the gate
     * could actually deadlock the FLOAT loop.
     */
    checkTermsGate(silent) {
        if (this.termsChecked)
            return;
        this.termsChecked = true;
        const accepted = process.env['CIRCLE_ACCEPT_TERMS'] === '1';
        if (accepted) {
            console.log('[FLOAT] CIRCLE_ACCEPT_TERMS=1 detected. Terms gate will not block CLI calls.');
            return;
        }
        if (isNonInteractive() && !silent) {
            console.warn('[FLOAT WARNING] Running in a non-interactive shell without CIRCLE_ACCEPT_TERMS=1. ' +
                'If the Circle CLI has not yet been initialized on this host, wallet commands will fail ' +
                'with a Terms-acceptance error. Run "circle terms accept" once interactively, or set ' +
                'CIRCLE_ACCEPT_TERMS=1 in your environment before starting FLOAT.');
        }
    }
    async runCommand(cmd) {
        try {
            const { stdout } = await execAsync(cmd);
            return JSON.parse(stdout);
        }
        catch (err) {
            const msg = `${err.stderr ?? ''} ${err.message ?? ''}`;
            if (msg.includes('Terms acceptance is required') || msg.includes('terms of service')) {
                throw new Error('[FLOAT] Circle CLI Terms gate hit. Run "circle terms accept" interactively once, ' +
                    'or set CIRCLE_ACCEPT_TERMS=1 in this environment before invoking FLOAT.');
            }
            if (msg.includes('Not logged in') || msg.includes('AUTH_REQUIRED')) {
                throw new Error('[FLOAT] Circle CLI session expired. Re-run `circle wallet login` and retry.');
            }
            throw new Error(`[FLOAT] Circle CLI command failed: ${err.stderr || err.message}`);
        }
    }
    async getAddress() {
        if (this.walletAddress) {
            return this.walletAddress;
        }
        const result = await this.runCommand(`circle wallet list --chain ${this.chain} --type agent --output json`);
        const wallets = result?.data?.wallets || [];
        if (wallets.length === 0) {
            throw new Error(`[FLOAT] No agent wallets found on chain ${this.chain} in Circle CLI.`);
        }
        const matched = this.walletId
            ? wallets.find((w) => w.id === this.walletId || w.address === this.walletId)
            : wallets[0];
        if (!matched) {
            throw new Error(`[FLOAT] Wallet ID ${this.walletId} not found in Circle CLI wallet list.`);
        }
        this.walletAddress = matched.address;
        if (!this.walletId) {
            this.walletId = matched.id || matched.address;
        }
        return this.walletAddress;
    }
    async getBalance(tokenAddress) {
        const address = await this.getAddress();
        const token = tokenAddress ?? ARC_USDC;
        // Fast path: direct RPC call
        try {
            const paddedAddr = address.slice(2).padStart(64, '0');
            const raw = await arcRpc('eth_call', [
                { to: token, data: `0x70a08231${paddedAddr}` },
                'latest',
            ]);
            const rawBalance = BigInt(raw || '0x0');
            return Number(rawBalance) / Math.pow(10, USDC_DECIMALS);
        }
        catch (rpcErr) {
            console.warn(`[FLOAT] Direct RPC getBalance failed, falling back to CLI: ${rpcErr.message}`);
        }
        // Fallback path: CLI balance query
        const result = await this.runCommand(`circle wallet balance --address ${address} --chain ${this.chain} --output json`);
        const balances = result?.data?.balances || [];
        const matched = balances.find((b) => b.tokenAddress?.toLowerCase() === token.toLowerCase() ||
            b.token?.symbol?.toUpperCase() === 'USDC');
        return matched ? parseFloat(matched.amount) : 0;
    }
    /**
     * Look up a previously-submitted transaction by Circle ID via `circle transaction list`.
     * Returns the most recent matching record; falls back to UNKNOWN if not found.
     */
    async getTransactionStatus(txId) {
        // Fast path: cached hash -> RPC eth_getTransactionReceipt
        const knownHash = this._txHashCache.get(txId);
        if (knownHash) {
            try {
                const receipt = await arcRpc('eth_getTransactionReceipt', [knownHash]);
                if (receipt === null || receipt === undefined) {
                    return { status: 'PENDING', txHash: knownHash };
                }
                const success = receipt.status === '0x1' || receipt.status === 1;
                return { status: success ? 'COMPLETE' : 'FAILED', txHash: knownHash };
            }
            catch {
                // Fall back to CLI
            }
        }
        // Slow path: Circle CLI
        try {
            const address = await this.getAddress();
            const result = await this.runCommand(`circle transaction list --address ${address} --chain ${this.chain} --limit 50 --output json`);
            const txs = result?.data?.transactions || [];
            const match = txs.find((t) => t.id === txId);
            if (!match) {
                return { status: 'UNKNOWN' };
            }
            const status = (match.state || match.status || 'UNKNOWN').toUpperCase();
            const txHash = match.txHash || match.hash;
            if (txHash) {
                this._txHashCache.set(txId, txHash);
            }
            return { status, txHash };
        }
        catch {
            return { status: 'UNKNOWN' };
        }
    }
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
    async executeContract(params) {
        const sourceAddress = await this.getAddress();
        const argStr = (params.args ?? []).map(a => String(a)).join(' ');
        const cmd = `circle wallet execute "${params.signature}" ${argStr} ` +
            `--contract ${params.contractAddress} --address ${sourceAddress} ` +
            `--chain ${this.chain} --output json`;
        console.log(`[FLOAT] Invoking: ${cmd}`);
        const result = await this.runCommand(cmd);
        const tx = result?.data?.transaction || result?.data || {};
        const submission = {
            txHash: tx.txHash || tx.hash || '',
            txId: tx.id || tx.transactionId || '',
            status: (tx.state || tx.status || 'PENDING').toUpperCase(),
        };
        if (submission.txId && submission.txHash) {
            this.rememberTxHash(submission.txId, submission.txHash);
        }
        const wait = params.waitForConfirmation === true;
        if (!wait)
            return submission;
        const timeoutMs = params.timeoutMs ?? this.confirmationTimeoutMs;
        const enableReplacement = params.enableReplacement !== false; // default true for contract calls
        const startedAt = Date.now();
        let accelerateAttempts = 0;
        let lastAccelerateAt = 0;
        while (Date.now() - startedAt < timeoutMs) {
            const status = await this.getTransactionStatus(submission.txId);
            const upper = status.status.toUpperCase();
            if (TERMINAL_SUCCESS.has(upper)) {
                return {
                    txHash: status.txHash || submission.txHash,
                    txId: submission.txId,
                    status: 'COMPLETE',
                    confirmationMs: Date.now() - startedAt,
                };
            }
            if (TERMINAL_FAILURE.has(upper)) {
                throw new Error(`[FLOAT] Contract execution ${submission.txId} terminated with status ${upper}.`);
            }
            const sinceLastAccelerate = Date.now() - (lastAccelerateAt || startedAt);
            const isStuck = upper === 'STUCK' || sinceLastAccelerate > this.accelerateThresholdMs;
            if (enableReplacement && isStuck && accelerateAttempts < this.maxAccelerateAttempts) {
                accelerateAttempts++;
                console.warn(`[FLOAT] Contract tx ${submission.txId} pending past ${this.accelerateThresholdMs}ms. ` +
                    `Requesting acceleration (attempt ${accelerateAttempts}/${this.maxAccelerateAttempts}).`);
                try {
                    await this.runCommand(`circle transaction accelerate ${submission.txId} --address ${sourceAddress} --chain ${this.chain} --output json`);
                    lastAccelerateAt = Date.now();
                }
                catch (accelErr) {
                    console.warn(`[FLOAT] Accelerate request failed (continuing to poll): ${accelErr.message}`);
                }
            }
            await sleep(this.confirmationPollMs);
        }
        throw new Error(`[FLOAT] Contract tx ${submission.txId} did not confirm within ${timeoutMs}ms.`);
    }
    /**
     * Submit a transfer through Circle's CLI. The CLI returns the Circle transaction
     * ID immediately after broadcast; onchain confirmation is polled via
     * `circle transaction list`. Pass `waitForConfirmation: true` to block until
     * the tx is COMPLETE/CONFIRMED or `timeoutMs` elapses. If `enableReplacement`
     * is set and the tx stalls past `accelerateThresholdMs`, the SDK calls
     * `circle transaction accelerate` (Circle's native speed-up).
     */
    async transfer(params) {
        const sourceAddress = await this.getAddress();
        const wait = params.waitForConfirmation === true;
        const timeoutMs = params.timeoutMs ?? this.confirmationTimeoutMs;
        const enableReplacement = params.enableReplacement === true;
        const submission = await this.submit(sourceAddress, params.destinationAddress, params.amount, params.tokenId);
        if (submission.txId && submission.txHash) {
            this.rememberTxHash(submission.txId, submission.txHash);
        }
        if (!wait) {
            return submission;
        }
        const startedAt = Date.now();
        let accelerateAttempts = 0;
        let lastAccelerateAt = 0;
        while (Date.now() - startedAt < timeoutMs) {
            const status = await this.getTransactionStatus(submission.txId);
            const upper = status.status.toUpperCase();
            if (TERMINAL_SUCCESS.has(upper)) {
                return {
                    txHash: status.txHash || submission.txHash,
                    txId: submission.txId,
                    status: 'COMPLETE',
                    confirmationMs: Date.now() - startedAt,
                    accelerateAttempts,
                };
            }
            if (TERMINAL_FAILURE.has(upper)) {
                throw new Error(`[FLOAT] Transfer ${submission.txId} terminated with status ${upper}.`);
            }
            // Stuck-pending detection: speed-up via Circle's native accelerate command.
            const sinceLastAccelerate = Date.now() - (lastAccelerateAt || startedAt);
            const isStuck = upper === 'STUCK' || sinceLastAccelerate > this.accelerateThresholdMs;
            if (enableReplacement && isStuck && accelerateAttempts < this.maxAccelerateAttempts) {
                accelerateAttempts++;
                console.warn(`[FLOAT] Transfer ${submission.txId} pending past ${this.accelerateThresholdMs}ms (state=${upper}). ` +
                    `Requesting acceleration (attempt ${accelerateAttempts}/${this.maxAccelerateAttempts}).`);
                try {
                    await this.runCommand(`circle transaction accelerate ${submission.txId} --address ${sourceAddress} --chain ${this.chain} --output json`);
                    lastAccelerateAt = Date.now();
                }
                catch (accelErr) {
                    // Acceleration is best-effort; keep polling either way.
                    console.warn(`[FLOAT] Accelerate request failed (continuing to poll): ${accelErr.message}`);
                }
            }
            await sleep(this.confirmationPollMs);
        }
        throw new Error(`[FLOAT] Transfer ${submission.txId} did not confirm within ${timeoutMs}ms ` +
            `(${accelerateAttempts} accelerate attempts). Last known status: pending.`);
    }
    async submit(sourceAddress, destinationAddress, amount, tokenAddress) {
        const tokenFlag = tokenAddress ? `--token ${tokenAddress} ` : '';
        const cmd = `circle wallet transfer ${destinationAddress} --amount ${amount} ` +
            `${tokenFlag}--address ${sourceAddress} --chain ${this.chain} --output json`;
        console.log(`[FLOAT] Invoking: ${cmd}`);
        const result = await this.runCommand(cmd);
        const tx = result?.data?.transaction || result?.data || {};
        return {
            txHash: tx.txHash || tx.hash || '',
            txId: tx.id || tx.transactionId || '',
            status: (tx.state || tx.status || 'PENDING').toUpperCase(),
        };
    }
    async signTypedData(params) {
        const address = await this.getAddress();
        const escapedData = params.data.replace(/'/g, "'\\''");
        const cmd = `circle wallet sign typed-data '${escapedData}' --address ${address} --chain ${this.chain} --output json`;
        console.log(`[FLOAT CLI] ${cmd.replace(escapedData, '...')}`);
        const result = await this.runCommand(cmd);
        const signature = result?.data?.signature || result?.signature || '';
        if (!signature) {
            throw new Error(`[FLOAT] Failed to sign typed data: no signature in output: ${JSON.stringify(result)}`);
        }
        return { signature };
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=CircleCliAdapter.js.map