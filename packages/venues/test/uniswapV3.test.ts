import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UniswapV3Adapter, SUPPORTED_CHAIN_IDS } from '../src/index.ts';
import { CHAIN, NPM, POOL, SEL_MINT, TOKEN, USDC, quoteReq, v3Pool } from './fixtures.ts';

function adapter() {
  return new UniswapV3Adapter({ chainId: CHAIN });
}

test('adapter pins to a verified chain; mainnet is unconfigured', () => {
  assert.ok(SUPPORTED_CHAIN_IDS.includes(5042002));
  assert.throws(() => new UniswapV3Adapter({ chainId: 999999 }), /not a supported/);
  assert.throws(() => new UniswapV3Adapter({ chainId: 0 }), /not a supported/);
});

test('v3 supports LP actions and rejects SWAP (phase-2 needs a swap router)', () => {
  const a = adapter();
  assert.ok(a.supportsAction('ENTER'));
  assert.ok(a.supportsAction('RANGE_CHANGE'));
  assert.ok(a.supportsAction('COLLECT'));
  assert.ok(a.supportsAction('EXIT'));
  assert.equal(a.supportsAction('SWAP'), false);
  assert.throws(() => a.quote(quoteReq({ action: 'SWAP' })), /unsupported/);
});

test('compatible public full-range pool passes', () => {
  const r = adapter().checkPoolCompatible(v3Pool());
  assert.ok(r.ok, JSON.stringify(r));
});

test('v3 adapter rejects v4/aerodrome pools (distinct implementations)', () => {
  for (const kind of ['uniswap-v4', 'aerodrome'] as const) {
    const r = adapter().checkPoolCompatible(v3Pool({ venueKind: kind }));
    assert.ok(!r.ok, kind);
    assert.ok(r.codes.includes('VENUE_MISMATCH'));
  }
});

test('rejects creator-locked LP and non-public pools', () => {
  const locked = adapter().checkPoolCompatible(v3Pool({ isCreatorLocked: true }));
  assert.ok(!locked.ok && locked.codes.includes('CREATOR_LOCKED'));
  const priv = adapter().checkPoolCompatible(v3Pool({ allowsPublicMint: false }));
  assert.ok(!priv.ok && priv.codes.includes('NO_PUBLIC_MINT'));
});

test('rejects fee-on-transfer and rebasing tokens', () => {
  const fot = adapter().checkPoolCompatible(
    v3Pool({ token0: { address: USDC, symbol: 'USDC', decimals: 6, isFeeOnTransfer: true, isRebasing: false } }),
  );
  assert.ok(fot.codes.includes('FEE_ON_TRANSFER_DEFERRED'));
  const reb = adapter().checkPoolCompatible(
    v3Pool({ token1: { address: TOKEN, symbol: 'TKN', decimals: 18, isFeeOnTransfer: false, isRebasing: true } }),
  );
  assert.ok(reb.codes.includes('REBASING_DEFERRED'));
});

test('quote computes min-received and fails closed on bad input', () => {
  const a = adapter();
  const q = a.quote(quoteReq());
  assert.equal(q.minReceivedUsdcAtomic, 39_880_000n); // 40 USDC - 30bps
  assert.equal(q.pool, POOL);
  assert.throws(() => a.quote(quoteReq({ action: 'ENTER', amountUsdcAtomic: 0n })), /ENTER requires/);
  assert.throws(() => a.quote(quoteReq({ slippageBps: 20_000 })), /slippage/);
  assert.throws(() => a.quote(quoteReq({ quoteAgeSeconds: -1 })), /fails closed/);
  assert.throws(
    () => a.quote(quoteReq({ nowSeconds: 100, expiresAtSeconds: 100 })),
    /expired/,
  );
  assert.throws(() => a.quote(quoteReq({ pool: v3Pool({ isCreatorLocked: true }) })), /incompatible/);
});

test('simulate HOLDs when costs exceed pessimistic fees; PROCEEDs otherwise', () => {
  const a = adapter();
  const q = a.quote(quoteReq());
  const hold = a.simulate(q, { observedFeesUsdcAtomic: 100n }); // dust fees
  assert.equal(hold.decision, 'HOLD');
  assert.ok(hold.holdReason);
  assert.ok(hold.scenarios.length >= 3);

  const go = a.simulate(q, { observedFeesUsdcAtomic: 10_000_000n }); // $10 fees vs ~$0.70 costs
  assert.equal(go.decision, 'PROCEED');
  assert.equal(go.holdReason, null);
});

test('collect HOLDs when gas alone exceeds fees', () => {
  const a = adapter();
  const q = a.quote(quoteReq({ action: 'COLLECT', amountUsdcAtomic: 0n }));
  const r = a.simulate(q, { observedFeesUsdcAtomic: 100n });
  assert.equal(r.decision, 'HOLD');
});

test('toPolicyActionShape maps onto the policy gate without inventing calldata', () => {
  const a = adapter();
  const q = a.quote(quoteReq());
  const shape = a.toPolicyActionShape(q, {
    contract: NPM,
    selector: SEL_MINT,
    pool: POOL,
    tokensTouched: [USDC, TOKEN],
  });
  assert.equal(shape.type, 'ENTER');
  assert.equal(shape.notionalAtomic, 40_000_000n);
  assert.equal(shape.quoteAgeSeconds, 5);
  assert.throws(
    () => a.toPolicyActionShape(q, { contract: '0xbad', selector: SEL_MINT, pool: POOL, tokensTouched: [] }),
    /contract/,
  );
  assert.throws(
    () => a.toPolicyActionShape(q, { contract: NPM, selector: '0x123', pool: POOL, tokensTouched: [] }),
    /selector/,
  );
});
