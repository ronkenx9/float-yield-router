import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenTokens } from '../src/index.ts';
import type { ScreenParams, TokenMetrics, TokenRecord } from '../src/index.ts';

const NOW = 1_700_000_000;
const DAY = 24 * 3600;
const U = (v: string): bigint => {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
};
const addr = (c: string) => `0x${c.repeat(40).slice(0, 40)}`;

function token(sym: string, overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    address: addr(sym.toLowerCase()[0] ?? 'a'),
    symbol: sym,
    decimals: 18,
    deployer: addr('d'),
    deployedAtSeconds: NOW - 10 * DAY,
    poolAddress: addr('e'),
    venueKind: 'uniswap-v3',
    isFeeOnTransfer: false,
    isRebasing: false,
    isCreatorLocked: false,
    ...overrides,
  };
}

function mkMetrics(overrides: Partial<TokenMetrics> = {}, forAddr?: string): TokenMetrics {
  return {
    tokenAddress: forAddr ?? addr('a'),
    liquidityUsdcAtomic: U('50000'),
    volumeWindowUsdcAtomic: U('20000'),
    feesWindowUsdcAtomic: U('60'),
    holderCount: 400,
    sampleWindowSeconds: 14 * DAY,
    dataAgeSeconds: 30,
    ...overrides,
  };
}

function params(overrides: Partial<ScreenParams> = {}): ScreenParams {
  return {
    minAgeSeconds: null,
    maxAgeSeconds: null,
    minLiquidityUsdcAtomic: U('1000'),
    minVolumeUsdcAtomic: U('100'),
    minHolders: 10,
    maxDataAgeSeconds: 300,
    sortBy: 'volume',
    topN: 5,
    ...overrides,
  };
}

function universe(): { tokens: TokenRecord[]; metrics: Map<string, TokenMetrics> } {
  const hot = token('HOT', { address: addr('a') });
  const sleepy = token('SLEEPY', { address: addr('b') });
  const newborn = token('NEWBORN', { address: addr('c'), deployedAtSeconds: NOW - 3600 });
  const thin = token('THIN', { address: addr('f') });
  const tax = token('TAX', { address: addr('1'), isFeeOnTransfer: true });
  const locked = token('LOCKED', { address: addr('2'), isCreatorLocked: true });
  const tokens = [hot, sleepy, newborn, thin, tax, locked];
  const byToken = new Map<string, TokenMetrics>([
    [hot.address.toLowerCase(), mkMetrics({}, hot.address)],
    [sleepy.address.toLowerCase(), mkMetrics({ volumeWindowUsdcAtomic: U('500') }, sleepy.address)],
    [newborn.address.toLowerCase(), mkMetrics({ volumeWindowUsdcAtomic: U('90000'), holderCount: 1200 }, newborn.address)],
    [thin.address.toLowerCase(), mkMetrics({ liquidityUsdcAtomic: U('50') }, thin.address)],
    [tax.address.toLowerCase(), mkMetrics({}, tax.address)],
    [locked.address.toLowerCase(), mkMetrics({}, locked.address)],
  ]);
  return { tokens, metrics: byToken };
}

test('ranks by volume and drops thin/tax/locked with reasons', () => {
  const { tokens, metrics: m } = universe();
  const r = screenTokens(tokens, m, params(), NOW);
  assert.deepEqual(r.rows.map((x) => x.token.symbol), ['NEWBORN', 'HOT', 'SLEEPY']);
  assert.ok(r.excluded.some((e) => e.symbol === 'THIN' && e.reason.includes('liquidity')));
  assert.ok(r.excluded.some((e) => e.symbol === 'TAX' && e.reason.includes('deferred')));
  assert.ok(r.excluded.some((e) => e.symbol === 'LOCKED' && e.reason.includes('creator-locked')));
});

test('min age excludes newborns; flags mark the risky', () => {
  const { tokens, metrics: m } = universe();
  const r = screenTokens(tokens, m, params({ minAgeSeconds: 7 * DAY }), NOW);
  assert.ok(!r.rows.some((x) => x.token.symbol === 'NEWBORN'));
  const unfiltered = screenTokens(tokens, m, params(), NOW);
  const nb = unfiltered.rows.find((x) => x.token.symbol === 'NEWBORN');
  assert.ok(nb?.riskFlags.includes('launched-under-24h'));
});

test('stale or missing metrics exclude, never zero-fill', () => {
  const { tokens, metrics: m } = universe();
  const hot = tokens[0];
  m.set(hot.address.toLowerCase(), mkMetrics({ dataAgeSeconds: 99999 }, hot.address));
  const r = screenTokens(tokens, m, params(), NOW);
  assert.ok(!r.rows.some((x) => x.token.symbol === 'HOT'));
  assert.ok(r.excluded.some((e) => e.symbol === 'HOT' && e.reason.includes('Stale') || e.reason.includes('stale')));
  m.delete(tokens[1].address.toLowerCase());
  const r2 = screenTokens(tokens, m, params(), NOW);
  assert.ok(r2.excluded.some((e) => e.symbol === 'SLEEPY' && e.reason.includes('no metrics')));
});

test('volume-dwarfs-liquidity and few-holders flags fire', () => {
  const t = token('RISKY', { address: addr('9') });
  const m = new Map([[t.address.toLowerCase(), mkMetrics({ liquidityUsdcAtomic: U('100'), volumeWindowUsdcAtomic: U('50000'), holderCount: 12 }, t.address)]]);
  const r = screenTokens([t], m, params({ minLiquidityUsdcAtomic: 0n, minVolumeUsdcAtomic: 0n, minHolders: 0 }), NOW);
  assert.ok(r.rows[0].riskFlags.includes('volume-dwarfs-liquidity'));
  assert.ok(r.rows[0].riskFlags.includes('few-holders'));
});

test('sort keys and topN bound the output', () => {
  const { tokens, metrics: m } = universe();
  const byLiq = screenTokens(tokens, m, params({ sortBy: 'liquidity', topN: 2 }), NOW);
  assert.equal(byLiq.rows.length, 2);
  const byNew = screenTokens(tokens, m, params({ sortBy: 'newest', topN: 1 }), NOW);
  assert.equal(byNew.rows[0].token.symbol, 'NEWBORN');
  assert.throws(() => screenTokens(tokens, m, params({ topN: 0 }), NOW), /topN/);
  assert.throws(() => screenTokens(tokens, m, params({ topN: 99 }), NOW), /topN/);
});

test('bad addresses and future deploys drop with reasons', () => {
  const bad = token('BAD', { address: '0xnope' });
  const future = token('FUT', { deployedAtSeconds: NOW + 999 });
  const m = new Map<string, TokenMetrics>();
  const r = screenTokens([bad, future], m, params(), NOW);
  assert.equal(r.rows.length, 0);
  assert.equal(r.excluded.length, 2);
});
