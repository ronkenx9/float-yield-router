import type { Policy, ProposedAction } from '../src/index.ts';
import { usdcToAtomic, ARC_TESTNET } from '../src/index.ts';

const USDC = '0x3600000000000000000000000000000000000000';
const WETH = '0x0000000000000000000000000000000000000001';
const POOL = '0x00000000000000000000000000000000000000aa';
const NPM = '0x00000000000000000000000000000000000000bb'; // NonfungiblePositionManager
const SEL_MINT = '0x88316456';

/** A valid, MVP-legal Balanced policy against Arc Testnet. */
export function validPolicy(overrides: Partial<Policy> = {}): Policy {
  const base: Policy = {
    policyId: 'pol_1',
    version: 1,
    userId: 'user_1',
    chainId: ARC_TESTNET.chainId,
    effectiveAt: 1_700_000_000,
    expiresAt: 1_800_000_000,
    mode: 'Balanced',
    accountAddress: '0x00000000000000000000000000000000000000ff',
    capitalBudgetUsdcAtomic: usdcToAtomic('500'),
    allowedTokens: [USDC, WETH],
    allowedPools: [POOL],
    allowedContracts: [NPM],
    allowedSelectors: [SEL_MINT],
    maxPositionBps: 1000, // 10% of budget => 50 USDC
    maxTokenExposureBps: 5000, // 50%
    minUsdcReserveAtomic: usdcToAtomic('150'), // 30%
    maxSlippageBps: 50,
    maxPriceImpactBps: 100,
    maxGasPerActionAtomic: usdcToAtomic('1'),
    dailyExecutionBudgetAtomic: usdcToAtomic('5'),
    maxActionsPerDay: 5,
    cooldownSeconds: 300,
    maxQuoteAgeSeconds: 30,
    maxDataAgeSeconds: 60,
    approvalMode: 'per_action',
    allowNewPoolEntry: true,
    allowRangeChange: true,
    allowFeeCollection: true,
    allowExitSwap: true,
    allowSwap: false,
    pauseState: 'active',
    userApprovalDigest: 'digest_abc',
  };
  return { ...base, ...overrides };
}

/** A valid ENTER action for the valid policy's allowlisted pool. */
export function validAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  const base: ProposedAction = {
    type: 'ENTER',
    pool: POOL,
    contract: NPM,
    selector: SEL_MINT,
    tokensTouched: [USDC, WETH],
    notionalAtomic: usdcToAtomic('40'), // < 50 USDC max position
    slippageBps: 30,
    priceImpactBps: 50,
    gasAtomic: usdcToAtomic('0.5'),
    quoteAgeSeconds: 5,
    dataAgeSeconds: 10,
  };
  return { ...base, ...overrides };
}

export const ADDR = { USDC, WETH, POOL, NPM, SEL_MINT };
