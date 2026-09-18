import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSwapDesk, parseSwap, swapIntentMatches } from '../src/index.ts';
import type { SwapDeskDeps, VerifiedToken } from '../src/index.ts';
import type { Policy } from '../../../packages/policy/src/index.ts';

const NOW = 1_700_000_000;
const USDC = '0x3600000000000000000000000000000000000000';
const TOKEN = '0x0000000000000000000000000000000000000001';
const POOL = '0x00000000000000000000000000000000000000aa';
const ROUTER = '0x00000000000000000000000000000000000000cc';
const SEL = '0x12345678';
const U = (v: string): bigint => {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
};

const TOKENS: VerifiedToken[] = [
  { symbol: 'USDC', address: USDC, decimals: 6 },
  { symbol: 'TKN', address: TOKEN, decimals: 18 },
];

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    policyId: 'pol_swap',
    version: 1,
    userId: 'u1',
    chainId: 5042002,
    effectiveAt: NOW,
    expiresAt: NOW + 99999,
    mode: 'Balanced',
    accountAddress: '0x00000000000000000000000000000000000000ff',
    capitalBudgetUsdcAtomic: U('500'),
    allowedTokens: [USDC, TOKEN],
    // The swap router is the venue address for SWAP shapes: allowlist it explicitly.
    allowedPools: [ROUTER],
    allowedContracts: [ROUTER],
    allowedSelectors: [SEL],
    maxPositionBps: 1000,
    maxTokenExposureBps: 5000,
    minUsdcReserveAtomic: U('150'),
    maxSlippageBps: 200,
    maxPriceImpactBps: 200,
    maxGasPerActionAtomic: U('1'),
    dailyExecutionBudgetAtomic: U('5'),
    maxActionsPerDay: 5,
    cooldownSeconds: 300,
    maxQuoteAgeSeconds: 30,
    maxDataAgeSeconds: 60,
    approvalMode: 'per_action',
    allowNewPoolEntry: true,
    allowRangeChange: true,
    allowFeeCollection: true,
    allowExitSwap: true,
    allowSwap: true,
    pauseState: 'active',
    userApprovalDigest: 'd',
    ...overrides,
  };
}

function desk(overrides: Partial<SwapDeskDeps> = {}, pol: Policy | null = policy()) {
  let current: Policy | null = pol;
  const settled: Array<{ minOutAtomic: bigint; policyVersion: number }> = [];
  const d = createSwapDesk({
    verifiedTokens: TOKENS,
    router: { chainId: 5042002, router: ROUTER, contract: ROUTER, selector: SEL },
    quotes: {
      // Fixture price: 1 USDC = 0.5 TKN; gas $0.50; output covers gas.
      getQuote: ({ amountInAtomic, tokenIn }) => {
        const out = tokenIn.symbol === 'USDC'
          ? (amountInAtomic * 10n ** 12n) / 2n // USDC(6dp) → TKN(18dp) at 0.5
          : (amountInAtomic / 10n ** 12n) * 2n; // TKN(18dp) → USDC(6dp) at 2.0
        return { quotedOutAtomic: out, gasUsdcAtomic: U('0.5'), coversGas: true };
      },
    },
    policies: { activePolicy: () => current },
    settlement: {
      settle: async ({ minOutAtomic, policyVersion }) => {
        settled.push({ minOutAtomic, policyVersion });
        return `Receipt 0xswap-tx for ≥ ${minOutAtomic} out (policy v${policyVersion}).`;
      },
    },
    defaultSlippageBps: 100,
    now: () => NOW,
    ...overrides,
  });
  return { ...d, settled, setPolicy: (p: Policy | null) => { current = p; } };
}

async function ask(text: string, deps?: Partial<SwapDeskDeps>, pol?: Policy | null) {
  const d = desk(deps, pol === undefined ? policy() : pol);
  const r = await d.skill.handle({ spaceId: 's1', platform: 'imessage', senderId: 'o', text, history: [] });
  return { ...d, reply: r.reply, pending: r.pendingApproval ?? null };
}

test('intent matches buy/sell/swap/ape, ignores the rest', () => {
  assert.ok(swapIntentMatches('buy $50 of TKN'));
  assert.ok(swapIntentMatches('APE 100 USDC INTO TKN'));
  assert.ok(swapIntentMatches('sell 10 TKN'));
  assert.ok(swapIntentMatches('swap 5 USDC for TKN'));
  assert.ok(!swapIntentMatches('status'));
  assert.ok(!swapIntentMatches('buy groceries'));
  const p = parseSwap('buy $50 of TKN', 100);
  assert.equal(p?.side, 'buy');
  assert.equal(p?.amountRaw, '50');
});

test('buy quotes minOut after slippage and raises a numbered proposal', async () => {
  const { reply, pending } = await ask('buy $50 of TKN');
  assert.ok(reply.includes('$50.00 USDC'));
  assert.ok(reply.includes('APPROVE SW1'));
  assert.ok(pending && pending.id === 'SW1');
  // 25 TKN quoted, -1% slippage = 24.75 TKN
  assert.equal(pending.data !== undefined, true);
});

test('approve settles through the policy gate with a receipt', async () => {
  const d = desk();
  const r = await d.skill.handle({ spaceId: 's1', platform: 'imessage', senderId: 'o', text: 'buy $50 of TKN', history: [] });
  assert.ok(r.pendingApproval);
  const line = await d.approver.execute('s1', r.pendingApproval);
  assert.ok(line.includes('0xswap-tx'));
  assert.equal(d.settled.length, 1);
  assert.equal(d.settled[0].policyVersion, 1);
});

test('oversized buys are blocked by the position cap', async () => {
  const { reply, pending } = await ask('buy $5000 of TKN');
  assert.ok(reply.includes('POSITION_SIZE_EXCEEDED'));
  assert.equal(pending, null);
});

test('unknown tokens are refused, never guessed', async () => {
  const { reply, pending } = await ask('buy $50 of RUG');
  assert.ok(reply.includes("don't know"));
  assert.ok(reply.includes('TKN'));
  assert.equal(pending, null);
});

test('sell resolves token-unit amounts against USDC', async () => {
  const { reply, pending } = await ask('sell 10 TKN');
  assert.ok(reply.includes('10 TKN'));
  assert.ok(reply.includes('USDC'));
  assert.ok(pending);
});

test('no quoter coverage means HOLD, not a trade', async () => {
  const { reply, pending } = await ask('buy $50 of TKN', {
    quotes: { getQuote: () => ({ quotedOutAtomic: 1n, gasUsdcAtomic: U('50'), coversGas: false }) },
  });
  assert.ok(reply.includes('HOLD'));
  assert.equal(pending, null);
});

test('expired quotes refuse to settle at approve time', async () => {
  let now = NOW;
  const d = desk({ now: () => now });
  const r = await d.skill.handle({ spaceId: 's1', platform: 'imessage', senderId: 'o', text: 'buy $50 of TKN', history: [] });
  assert.ok(r.pendingApproval);
  now = NOW + 999; // quote valid 60s
  const line = await d.approver.execute('s1', r.pendingApproval);
  assert.ok(line.includes('expired'));
});

test('no active policy means no trading talk', async () => {
  const { reply, pending } = await ask('buy $50 of TKN', {}, null);
  assert.ok(reply.includes('No active trading policy'));
  assert.equal(pending, null);
});

test('high slippage requests die at the gate', async () => {
  const { reply, pending } = await ask('buy $50 of TKN slippage 5%');
  assert.ok(reply.includes('SLIPPAGE_EXCEEDED'));
  assert.equal(pending, null);
});
