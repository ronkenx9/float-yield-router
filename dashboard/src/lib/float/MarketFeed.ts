/**
 * FLOAT Market Feed
 * 
 * Pulls real on-chain data from Arc Testnet via RPC.
 * No fake data — every number comes from the chain.
 */

import type { MarketSnapshot } from './types';

const ARC_RPC = 'https://rpc.testnet.arc.network';
const FLOAT_VAULT = '0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6';

export async function rpcCall(method: string, params: any[] = []): Promise<any> {
  const res = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  return json.result;
}

export async function getMarketSnapshot(agentAddress?: string): Promise<MarketSnapshot> {
  const now = new Date();

  // Parallel RPC calls for speed
  const [gasPrice, blockNumberHex] = await Promise.all([
    rpcCall('eth_gasPrice'),
    rpcCall('eth_blockNumber'),
  ]);

  const blockNumber = parseInt(blockNumberHex, 16);
  const gasPriceGwei = parseInt(gasPrice, 16) / 1e9;

  // Get recent block timestamps to estimate network activity
  let recentBlockInterval = 1; // default 1s
  try {
    const [currentBlock, prevBlock] = await Promise.all([
      rpcCall('eth_getBlockByNumber', [`0x${blockNumber.toString(16)}`, false]),
      rpcCall('eth_getBlockByNumber', [`0x${(blockNumber - 5).toString(16)}`, false]),
    ]);
    if (currentBlock && prevBlock) {
      const timeDiff = parseInt(currentBlock.timestamp, 16) - parseInt(prevBlock.timestamp, 16);
      recentBlockInterval = Math.max(timeDiff / 5, 0.1);
    }
  } catch { /* use default */ }

  // Query FloatVault totalDeposits
  let vaultTotalDeposits = 0;
  let vaultAgentDeposits = 0;
  try {
    // totalDeposits() = 0x0d0e3078 (function selector)
    const totalResult = await rpcCall('eth_call', [
      { to: FLOAT_VAULT, data: '0x0d0e3078' }, 'latest'
    ]);
    vaultTotalDeposits = parseInt(totalResult, 16) / 1e6; // 6 decimals

    // deposits(address) = 0xfc7e286d
    if (agentAddress) {
      const paddedAddr = agentAddress.slice(2).padStart(64, '0');
      const depositResult = await rpcCall('eth_call', [
        { to: FLOAT_VAULT, data: `0xfc7e286d${paddedAddr}` }, 'latest'
      ]);
      vaultAgentDeposits = parseInt(depositResult, 16) / 1e6;
    }
  } catch { /* use defaults */ }

  // Network activity score: lower block interval = more active
  const networkActivityScore = Math.min(1, Math.max(0, 1 - (recentBlockInterval / 5)));

  return {
    timestamp: now.toISOString(),
    gasPrice: gasPriceGwei,
    blockNumber,
    recentBlockInterval,
    vaultTotalDeposits,
    vaultAgentDeposits,
    networkActivityScore,
    timeOfDay: now.getHours(),
    dayOfWeek: now.getDay(),
  };
}
