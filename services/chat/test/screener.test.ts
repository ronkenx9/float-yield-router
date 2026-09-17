import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactUsd,
  parseScreenParams,
  screenerSkill,
} from '../src/index.ts';
import type { TokenMetrics, TokenRecord } from '../../../packages/screener/src/index.ts';

const NOW = 1_700_000_000;
const DAY = 24 * 3600;
const U = (v: string): bigint => {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
};
const addr = (c: string) => `0x${c.repeat(40).slice(0, 40)}`;

function token(sym: string, hex: string, deployedAgo: number): TokenRecord {
  return {
    address: addr(hex),
    symbol: sym,
    decimals: 18,
    deployer: addr('d'),
    deployedAtSeconds: NOW - deployedAgo,
    poolAddress: addr('e'),
    venueKind: 'uniswap-v3',
    isFeeOnTransfer: false,
    isRebasing: false,
    isCreatorLocked: false,
  };
}

function universe() {
  const tokens = [token('ALPHA', 'a', 10 * DAY), token('BETA', 'b', 2 * DAY)];
  const metrics = new Map<string, TokenMetrics>([
    [tokens[0].address.toLowerCase(), { tokenAddress: tokens[0].address, liquidityUsdcAtomic: U('80000'), volumeWindowUsdcAtomic: U('30000'), feesWindowUsdcAtomic: U('90'), holderCount: 900, sampleWindowSeconds: 14 * DAY, dataAgeSeconds: 20 }],
    [tokens[1].address.toLowerCase(), { tokenAddress: tokens[1].address, liquidityUsdcAtomic: U('5000'), volumeWindowUsdcAtomic: U('1000'), holderCount: 60, sampleWindowSeconds: 14 * DAY, dataAgeSeconds: 20, feesWindowUsdcAtomic: U('3') }],
  ]);
  return { tokens, metrics, nowSeconds: NOW };
}

function skill() {
  return screenerSkill({ universe: () => universe() });
}

async function reply(text: string): Promise<string> {
  const s = skill();
  const r = await s.handle({ spaceId: 's', platform: 'imessage', senderId: 'o', text, history: [] });
  return r.reply;
}

test('intent matches screen phrasing, ignores unrelated chat', () => {
  const s = skill();
  assert.ok(s.matches('screen new memes'));
  assert.ok(s.matches('find tokens with high volume'));
  assert.ok(s.matches('screener'));
  assert.ok(!s.matches('status'));
  assert.ok(!s.matches('hello there'));
});

test('params parse money, holders, age, sort, top', () => {
  const { params, defaulted } = parseScreenParams('screen memes liq over $50k vol over $5k 200+ holders older than 7 days top 3 sort by liquidity');
  assert.equal(params.minLiquidityUsdcAtomic, U('50000'));
  assert.equal(params.minVolumeUsdcAtomic, U('5000'));
  assert.equal(params.minHolders, 200);
  assert.equal(params.minAgeSeconds, 7 * DAY);
  assert.equal(params.sortBy, 'liquidity');
  assert.equal(params.topN, 3);
  assert.deepEqual(defaulted, []);
});

test('unstated fields take labeled defaults', () => {
  const { params, defaulted } = parseScreenParams('find new coins');
  assert.equal(params.sortBy, 'volume');
  assert.ok(defaulted.includes('liquidity') && defaulted.includes('holders') && defaulted.includes('age'));
});

test('reply lists evidence rows with flags and honesty line', async () => {
  const r = await reply('screen memes');
  assert.ok(r.includes('$ALPHA') && r.includes('$BETA'));
  assert.ok(r.includes('Screen, not a pick'));
  assert.ok(r.includes('defaults for:'));
});

test('filters narrow the list honestly', async () => {
  const r = await reply('screen memes liq over $50k');
  assert.ok(r.includes('$ALPHA'));
  assert.ok(!r.includes('$BETA'));
  assert.ok(!r.includes('Screen, not a pick') === false);
});

test('empty result says so with the drop reason', async () => {
  const r = await reply('screen memes liq over $99m');
  assert.ok(r.includes('No matches'));
  assert.ok(r.includes('Dropped'));
});

test('compact dollars never uses float money paths', () => {
  assert.equal(compactUsd(U('1500')), '$1.50k');
  assert.equal(compactUsd(U('2500000')), '$2.50m');
  assert.equal(compactUsd(U('42')), '$42.00');
});
