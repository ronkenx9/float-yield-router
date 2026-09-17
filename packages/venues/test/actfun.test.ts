import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTFUN_CREATOR_FEE_SPLIT_BPS,
  ACTFUN_PLATFORM_FEE_SPLIT_BPS,
  ACTFUN_V3_GRADUATION_FEE_BPS,
  actfunGraduationToV3PoolCandidate,
  classifyActfunPool,
} from '../src/index.ts';
import { CHAIN, POOL, TOKEN } from './fixtures.ts';

test('graduation economics match the observed ACTFUN surface', () => {
  assert.equal(ACTFUN_V3_GRADUATION_FEE_BPS, 30); // 0.30% full-range
  assert.equal(ACTFUN_CREATOR_FEE_SPLIT_BPS, 7000);
  assert.equal(ACTFUN_PLATFORM_FEE_SPLIT_BPS, 3000);
});

test('bonding curve is never an LP candidate', () => {
  const c = classifyActfunPool({
    isBondingCurve: true,
    isCreatorLocked: false,
    allowsPublicMint: true,
    venueKind: 'uniswap-v3',
  });
  assert.equal(c.klass, 'bonding-curve');
  assert.equal(c.floatCandidate, false);
});

test('creator-locked graduation LP is not FLOAT liquidity', () => {
  const c = classifyActfunPool({
    isBondingCurve: false,
    isCreatorLocked: true,
    allowsPublicMint: false,
    venueKind: 'uniswap-v3',
  });
  assert.equal(c.floatCandidate, false);
  assert.ok(c.reasons.join(' ').includes('70/30'));
});

test('graduated public pool is a candidate (not an approval)', () => {
  const c = classifyActfunPool({
    isBondingCurve: false,
    isCreatorLocked: false,
    allowsPublicMint: true,
    venueKind: 'uniswap-v3',
  });
  assert.equal(c.klass, 'graduated-public-pool');
  assert.equal(c.floatCandidate, true);
});

test('graduation mapper only emits public V3 0.30% full-range candidates', () => {
  const pool = actfunGraduationToV3PoolCandidate({
    poolAddress: POOL,
    chainId: CHAIN,
    tokenAddress: TOKEN,
    tokenSymbol: 'TKN',
    tokenDecimals: 18,
    allowsPublicMint: true,
    isCreatorLocked: false,
  });
  assert.ok(pool);
  assert.equal(pool?.venueKind, 'uniswap-v3');
  assert.equal(pool?.feeBps, 30);
  assert.equal(pool?.isFullRange, true);

  assert.equal(
    actfunGraduationToV3PoolCandidate({
      poolAddress: POOL,
      chainId: CHAIN,
      tokenAddress: TOKEN,
      tokenSymbol: 'TKN',
      tokenDecimals: 18,
      allowsPublicMint: false,
      isCreatorLocked: true,
    }),
    null,
  );
  assert.equal(
    actfunGraduationToV3PoolCandidate({
      poolAddress: POOL,
      chainId: CHAIN,
      tokenAddress: TOKEN,
      tokenSymbol: 'TKN',
      tokenDecimals: 18,
      allowsPublicMint: true,
      isCreatorLocked: false,
      feeBps: 100,
    }),
    null,
  );
});
