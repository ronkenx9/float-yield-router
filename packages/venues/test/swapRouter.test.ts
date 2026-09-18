import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SwapRouterAdapter, SWAP_SUPPORTED_CHAIN_IDS } from '../src/index.ts';
import type { SwapToken } from '../src/index.ts';

const CHAIN = 5042002;
const USDC = '0x3600000000000000000000000000000000000000';
const TOKEN = '0x0000000000000000000000000000000000000001';
const ROUTER = '0x00000000000000000000000000000000000000cc';
const U = (v: string): bigint => {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
};

function tok(symbol: string, address: string, overrides: Partial<SwapToken> = {}): SwapToken {
  return { address, symbol, decimals: 6, isFeeOnTransfer: false, isRebasing: false, ...overrides };
}
const usdc = () => tok('USDC', USDC);
const tkn = () => tok('TKN', TOKEN, { decimals: 18 });

function req(overrides = {}) {
  return {
    chainId: CHAIN,
    router: ROUTER,
    tokenIn: usdc(),
    tokenOut: tkn(),
    amountInAtomic: U('50'),
    quotedOutAtomic: 25_000_000_000_000_000_000n, // 25 TKN from the price source
    slippageBps: 100,
    priceImpactBps: 50,
    gasUsdcAtomic: U('0.5'),
    quoteAgeSeconds: 5,
    dataAgeSeconds: 10,
    expiresAtSeconds: 1_700_000_100,
    nowSeconds: 1_700_000_000,
    ...overrides,
  };
}

test('pins to a verified chain; supports SWAP only', () => {
  assert.ok(SWAP_SUPPORTED_CHAIN_IDS.includes(5042002));
  assert.throws(() => new SwapRouterAdapter({ chainId: 1 }), /not a supported/);
  const a = new SwapRouterAdapter({ chainId: CHAIN });
  assert.ok(a.supportsAction('SWAP'));
  assert.ok(!a.supportsAction('ENTER') && !a.supportsAction('COLLECT'));
});

test('compat rejects same-token, bad addresses, deferred mechanics', () => {
  const a = new SwapRouterAdapter({ chainId: CHAIN });
  assert.ok(!a.checkSwapCompatible(usdc(), usdc(), ROUTER).ok);
  assert.ok(a.checkSwapCompatible(usdc(), tkn(), ROUTER).ok);
  const fot = a.checkSwapCompatible(tok('X', TOKEN, { isFeeOnTransfer: true }), usdc(), ROUTER);
  assert.ok(fot.codes.includes('FEE_ON_TRANSFER_DEFERRED'));
  const reb = a.checkSwapCompatible(usdc(), tok('Y', TOKEN, { isRebasing: true }), ROUTER);
  assert.ok(reb.codes.includes('REBASING_DEFERRED'));
  assert.ok(a.checkSwapCompatible(usdc(), tkn(), '0xbad').codes.includes('ROUTER_ADDRESS_INVALID'));
});

test('quote applies slippage to the SOURCE price and fails closed', () => {
  const a = new SwapRouterAdapter({ chainId: CHAIN });
  const q = a.quoteSwap(req());
  assert.equal(q.minOutAtomic, (25_000_000_000_000_000_000n * 9900n) / 10000n); // -100bps
  assert.throws(() => a.quoteSwap(req({ amountInAtomic: 0n })), /amountIn/);
  assert.throws(() => a.quoteSwap(req({ quotedOutAtomic: 0n })), /quotedOut/);
  assert.throws(() => a.quoteSwap(req({ slippageBps: 20000 })), /slippage/);
  assert.throws(() => a.quoteSwap(req({ nowSeconds: 1_700_000_100, expiresAtSeconds: 1_700_000_100 })), /expired/);
  assert.throws(() => a.quoteSwap(req({ tokenOut: usdc() })), /incompatible/);
});

test('simulate HOLDs until quoter confirms gas coverage', () => {
  const a = new SwapRouterAdapter({ chainId: CHAIN });
  const q = a.quoteSwap(req());
  const hold = a.simulateSwap(q);
  assert.equal(hold.decision, 'HOLD');
  assert.ok(hold.holdReason?.includes('gas'));
  assert.ok(hold.scenarios.length >= 3);
  const go = a.simulateSwap(q, { coversGas: true });
  assert.equal(go.decision, 'PROCEED');
  assert.equal(go.netOutAtomic, q.minOutAtomic);
});

test('policy shape binds router, tokens, notional, and ages', () => {
  const a = new SwapRouterAdapter({ chainId: CHAIN });
  const q = a.quoteSwap(req());
  const shape = a.toPolicyActionShape(q, { contract: ROUTER, selector: '0x12345678', gasAtomic: U('0.5') });
  assert.equal(shape.type, 'SWAP');
  assert.deepEqual(shape.tokensTouched, [USDC, TOKEN]);
  assert.equal(shape.notionalAtomic, U('50'));
  assert.throws(() => a.toPolicyActionShape(q, { contract: '0xbad', selector: '0x12345678', gasAtomic: 0n }), /contract/);
  assert.throws(() => a.toPolicyActionShape(q, { contract: ROUTER, selector: '0x12', gasAtomic: 0n }), /selector/);
});

test('sell notionals override to USDC value (token atomic is meaningless vs a USDC cap)', () => {
  const a = new SwapRouterAdapter({ chainId: CHAIN });
  const q = a.quoteSwap(req());
  const overridden = a.toPolicyActionShape(q, { contract: ROUTER, selector: '0x12345678', gasAtomic: U('0.5'), notionalUsdcAtomic: U('20') });
  assert.equal(overridden.notionalAtomic, U('20'));
  assert.throws(() => a.toPolicyActionShape(q, { contract: ROUTER, selector: '0x12345678', gasAtomic: U('0.5'), notionalUsdcAtomic: 0n }), /notional/);
});
