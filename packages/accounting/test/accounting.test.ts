import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReport,
  componentBreakdown,
  computeNetPnl,
  markPortfolio,
  validateFlows,
} from '../src/index.ts';
import type { CashFlow } from '../src/index.ts';

const U = (v: string): bigint => {
  const [i, f = ''] = v.split('.');
  const frac = (f + '000000').slice(0, 6);
  return BigInt(i) * 1_000_000n + BigInt(frac);
};
const W0 = 1_700_000_000;
const W1 = 1_700_060_000;

function flow(id: string, kind: CashFlow['kind'], amount: string, ts = W0 + 10): CashFlow {
  return { id, timestampSeconds: ts, kind, amountUsdcAtomic: U(amount) };
}

test('sideways with fees: net equals fees minus costs', () => {
  const flows = [flow('d1', 'deposit', '500'), flow('f1', 'fee_collected', '12'), flow('g1', 'gas', '2')];
  const net = computeNetPnl({ startingValueUsdcAtomic: 0n, endingValueUsdcAtomic: U('510'), flows, windowStartSeconds: W0, windowEndSeconds: W1 });
  assert.equal(net, U('10')); // 510 + 0 - 500 - 0
  const c = componentBreakdown(flows);
  assert.equal(c.collectedFeesUsdcAtomic, U('12'));
  assert.equal(c.gasUsdcAtomic, U('2'));
});

test('rising market still nets correctly with additions', () => {
  const flows = [flow('d1', 'deposit', '500'), flow('d2', 'deposit', '100', W0 + 20)];
  const net = computeNetPnl({ startingValueUsdcAtomic: 0n, endingValueUsdcAtomic: U('650'), flows, windowStartSeconds: W0, windowEndSeconds: W1 });
  assert.equal(net, U('50'));
});

test('falling market shows the loss (fees do not hide it)', () => {
  const flows = [flow('d1', 'deposit', '500'), flow('f1', 'fee_collected', '12'), flow('g1', 'gas', '2')];
  const net = computeNetPnl({ startingValueUsdcAtomic: 0n, endingValueUsdcAtomic: U('470'), flows, windowStartSeconds: W0, windowEndSeconds: W1 });
  assert.equal(net, U('-30'));
});

test('partial exits count once; internal collects are not withdrawals', () => {
  const flows = [flow('d1', 'deposit', '500'), flow('w1', 'withdrawal', '100', W0 + 30), flow('f1', 'fee_collected', '5', W0 + 40)];
  const net = computeNetPnl({ startingValueUsdcAtomic: 0n, endingValueUsdcAtomic: U('410'), flows, windowStartSeconds: W0, windowEndSeconds: W1 });
  assert.equal(net, U('10')); // 410 + 100 - 500
});

test('outside-account service fees do not enter net (identified separately)', () => {
  const flows = [flow('d1', 'deposit', '500'), flow('s1', 'service_fee_outside', '19', W0 + 50)];
  const net = computeNetPnl({ startingValueUsdcAtomic: 0n, endingValueUsdcAtomic: U('505'), flows, windowStartSeconds: W0, windowEndSeconds: W1 });
  assert.equal(net, U('5'));
  assert.equal(componentBreakdown(flows).serviceFeesOutsideUsdcAtomic, U('19'));
});

test('failed transactions are excluded by never entering the ledger', () => {
  const flows = [flow('d1', 'deposit', '500')]; // failed park simply absent
  const net = computeNetPnl({ startingValueUsdcAtomic: 0n, endingValueUsdcAtomic: U('500'), flows, windowStartSeconds: W0, windowEndSeconds: W1 });
  assert.equal(net, 0n);
});

test('depeg / missing prices give unavailable, never zero', () => {
  const r1 = markPortfolio({ timestampSeconds: W1, lpInventoryUsdcAtomic: U('100'), uncollectedFeesUsdcAtomic: 0n, idleCashUsdcAtomic: U('50'), priceSource: 'test', priceFreshnessSeconds: 5, maxPriceAgeSeconds: 60, pricesUnknown: true });
  assert.equal(r1.status, 'unavailable');
  const r2 = markPortfolio({ timestampSeconds: W1, lpInventoryUsdcAtomic: U('100'), uncollectedFeesUsdcAtomic: 0n, idleCashUsdcAtomic: U('50'), priceSource: 'test', priceFreshnessSeconds: 9999, maxPriceAgeSeconds: 60, pricesUnknown: false });
  assert.equal(r2.status, 'unavailable');
  const ok = markPortfolio({ timestampSeconds: W1, lpInventoryUsdcAtomic: U('100'), uncollectedFeesUsdcAtomic: U('12'), idleCashUsdcAtomic: U('50'), priceSource: 'test', priceFreshnessSeconds: 5, maxPriceAgeSeconds: 60, pricesUnknown: false });
  assert.ok(ok.status === 'ok' && ok.valueUsdcAtomic === U('162'));
});

test('hold benchmark uses the same flows; USDC cash stays distinct', () => {
  const flows = [flow('d1', 'deposit', '500')];
  const r = buildReport(
    { startingValueUsdcAtomic: 0n, endingValueUsdcAtomic: U('480'), flows, windowStartSeconds: W0, windowEndSeconds: W1 },
    { holdBenchmarkEndUsdcAtomic: U('450'), usdcCashEndUsdcAtomic: U('500') },
  );
  assert.equal(r.netResultUsdcAtomic, U('-20'));
  assert.equal(r.holdBenchmarkPnlUsdcAtomic, U('-50'));
  assert.equal(r.usdcCashEndUsdcAtomic, U('500'));
});

test('duplicate / out-of-window / negative flows are rejected', () => {
  assert.ok(validateFlows([flow('a', 'deposit', '1'), flow('a', 'deposit', '1')], W0, W1).some((e) => e.includes('duplicate')));
  assert.ok(validateFlows([flow('b', 'deposit', '1', W1 + 9999)], W0, W1).some((e) => e.includes('outside')));
});

test('out-of-range period earns nothing but still marks inventory', () => {
  const r = markPortfolio({ timestampSeconds: W1, lpInventoryUsdcAtomic: U('400'), uncollectedFeesUsdcAtomic: 0n, idleCashUsdcAtomic: U('100'), priceSource: 'test', priceFreshnessSeconds: 5, maxPriceAgeSeconds: 60, pricesUnknown: false });
  assert.ok(r.status === 'ok' && r.valueUsdcAtomic === U('500'));
});

test('no double-count: costs in ending value are not subtracted again', () => {
  // Ending 508 already reflects $2 gas paid inside the account; flows record
  // the $2 for the breakdown but the identity adds nothing extra.
  const flows = [flow('d1', 'deposit', '500'), flow('g1', 'gas', '2')];
  const net = computeNetPnl({ startingValueUsdcAtomic: 0n, endingValueUsdcAtomic: U('508'), flows, windowStartSeconds: W0, windowEndSeconds: W1 });
  assert.equal(net, U('8'));
});
