/**
 * Screener chat skill: "find memecoins by parameters" in plain language.
 *
 * Deterministic intent + parameter parse over the @floatrouter/screener core.
 * The universe (tokens + metrics) is injected, so offline tests fake it and
 * the live shell reads the indexer later. Replies carry evidence per row and
 * end with the honesty line: a screen, not a pick. Nothing here buys anything
 * — buying arrives with the swap skill behind APPROVE-gated execution.
 */

import {
  SCREEN_DEFAULTS,
  screenTokens,
} from '../../../packages/screener/src/index.ts';
import type {
  ScreenParams,
  TokenMetrics,
  TokenRecord,
} from '../../../packages/screener/src/index.ts';
import type { Skill } from './types.ts';

export interface ScreenerUniverse {
  tokens: TokenRecord[];
  metrics: Map<string, TokenMetrics>;
  nowSeconds: number;
}

export interface ScreenerProvider {
  universe(): Promise<ScreenerUniverse> | ScreenerUniverse;
}

const USDC_ATOMIC = 1_000_000n;
const DAY_SECONDS = 24 * 3600;

function parseMoneyToAtomic(text: string, keywords: string[]): bigint | null {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx < 0) continue;
    // Money figures follow their keyword ("over $50k", "min $10k volume").
    const window = text.slice(idx, idx + kw.length + 24);
    const m = /\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kmb])?\b/i.exec(window);
    if (!m) continue;
    const num = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(num) || num < 0) continue;
    const mult = (m[2] ?? '').toLowerCase() === 'b' ? 1_000_000_000 : (m[2] ?? '').toLowerCase() === 'm' ? 1_000_000 : (m[2] ?? '').toLowerCase() === 'k' ? 1_000 : 1;
    return BigInt(Math.floor(num * mult)) * USDC_ATOMIC;
  }
  return null;
}

function parseCount(text: string, keywords: string[]): number | null {
  // Holder counts precede their keyword ("200+ holders"), so match adjacent first.
  const adjacent = /(\d[\d,]*)\s*\+?\s*holders?\b/i.exec(text);
  if (adjacent) return parseInt(adjacent[1].replace(/,/g, ''), 10);
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx < 0) continue;
    const window = text.slice(Math.max(0, idx - 16), idx + kw.length + 4);
    const m = /(\d[\d,]*)/.exec(window);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  }
  return null;
}

function parseDays(text: string, keywords: string[]): number | null {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx < 0) continue;
    const window = text.slice(Math.max(0, idx - 20), idx + kw.length + 4);
    const m = /(\d+(?:\.\d+)?)\s*(day|days|d\b|hour|hours|h\b|week|weeks|w\b)/i.exec(window);
    if (!m) continue;
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const days = unit.startsWith('hour') || unit === 'h' ? n / 24 : unit.startsWith('week') || unit === 'w' ? n * 7 : n;
    return Math.max(0, Math.floor(days * DAY_SECONDS));
  }
  return null;
}

/** Parse free text into screen params; unstated fields take labeled defaults. */
export function parseScreenParams(text: string): { params: ScreenParams; defaulted: string[] } {
  const lower = text.toLowerCase();
  const defaulted: string[] = [];
  const minLiq = parseMoneyToAtomic(text, ['liq', 'liquidity', 'depth']);
  const minVol = parseMoneyToAtomic(text, ['vol', 'volume']);
  const holders = parseCount(text, ['holder']);
  const minAge =
    parseDays(text, ['older than', 'at least', 'over ', 'more than', 'aged']) ??
    (/older/i.test(text) ? parseDays(text, ['older']) : null);
  const maxAge =
    parseDays(text, ['younger than', 'under ', 'less than', 'younger']) ??
    (/under \d/i.test(text) ? parseDays('under ' + text, ['under']) : null);
  let sortBy: ScreenParams['sortBy'] = 'volume';
  if (/\b(liq|liquidity)\b.*\bsort\b|\bsort\b.*\b(liq|liquidity)\b/i.test(text)) sortBy = 'liquidity';
  else if (/\bnewest\b|\bnew\b.*\bsort\b|\bsort\b.*\bnew\b/i.test(text)) sortBy = 'newest';
  else if (/\bfee\b/i.test(text)) sortBy = 'fees';
  const topM = /(?:top|first|show)\s*(\d{1,2})\b/i.exec(text);
  const topN = topM ? Math.min(20, Math.max(1, parseInt(topM[1], 10))) : SCREEN_DEFAULTS.topN;

  const params: ScreenParams = {
    minAgeSeconds: minAge,
    maxAgeSeconds: maxAge,
    minLiquidityUsdcAtomic: minLiq ?? SCREEN_DEFAULTS.minLiquidityUsdcAtomic,
    minVolumeUsdcAtomic: minVol ?? SCREEN_DEFAULTS.minVolumeUsdcAtomic,
    minHolders: holders ?? SCREEN_DEFAULTS.minHolders,
    maxDataAgeSeconds: SCREEN_DEFAULTS.maxDataAgeSeconds,
    sortBy,
    topN,
  };
  if (minLiq === null) defaulted.push('liquidity');
  if (minVol === null) defaulted.push('volume');
  if (holders === null) defaulted.push('holders');
  if (minAge === null && maxAge === null) defaulted.push('age');
  void lower;
  return { params, defaulted };
}

/** Compact dollars: 123456789 atomic → $123.46k style (display only). */
export function compactUsd(atomic: bigint): string {
  const neg = atomic < 0n;
  const abs = neg ? -atomic : atomic;
  const whole = Number(abs / USDC_ATOMIC);
  const frac = Number(abs % USDC_ATOMIC) / 1_000_000;
  const v = whole + frac;
  const fmt = (n: number, suffix: string) => {
    const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
    return `$${s}${suffix}`;
  };
  const out = v >= 1_000_000_000 ? fmt(v / 1_000_000_000, 'b') : v >= 1_000_000 ? fmt(v / 1_000_000, 'm') : v >= 1_000 ? fmt(v / 1_000, 'k') : `$${v.toFixed(v >= 100 ? 0 : 2)}`;
  return neg ? `-${out}` : out;
}

function ageLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < DAY_SECONDS) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / DAY_SECONDS)}d`;
}

export function screenerSkill(provider: ScreenerProvider): Skill {
  return {
    name: 'screener',
    description: 'Find memecoins by parameters: SCREEN <min liq> <min vol> <holders> <age>.',
    matches: (t) =>
      /^\s*screener\s*$/i.test(t) ||
      (/\b(screen|screener|find|search|scan)\b/i.test(t) &&
        /\b(coins?|tokens?|memes?|memecoins?|launch(?:es)?|gems?|new|pools?)\b/i.test(t)),
    handle: async (ctx) => {
      const { params, defaulted } = parseScreenParams(ctx.text);
      const uni = await provider.universe();
      const result = screenTokens(uni.tokens, uni.metrics, params, uni.nowSeconds);
      const filtLine =
        `Filters: liq≥${compactUsd(params.minLiquidityUsdcAtomic)}, ` +
        `vol≥${compactUsd(params.minVolumeUsdcAtomic)}, holders≥${params.minHolders}` +
        (params.minAgeSeconds !== null ? `, age≥${ageLabel(params.minAgeSeconds)}` : '') +
        (params.maxAgeSeconds !== null ? `, age≤${ageLabel(params.maxAgeSeconds)}` : '') +
        `, top ${params.topN} by ${params.sortBy}` +
        (defaulted.length > 0 ? ` (defaults for: ${defaulted.join(', ')})` : '');
      if (result.rows.length === 0) {
        const why =
          result.excluded.length > 0
            ? ` Dropped ${result.excluded.length} — e.g. ${result.excluded[0].symbol}: ${result.excluded[0].reason}.`
            : ' No tokens in the universe yet.';
        return { reply: `${filtLine}\nNo matches.${why}\nLoosen a filter or try again later.` };
      }
      const lines = result.rows.map((r, i) => {
        const flags = r.riskFlags.length > 0 ? ` [${r.riskFlags.join(', ')}]` : '';
        return `${i + 1}. $${r.token.symbol} — liq ${compactUsd(r.metrics.liquidityUsdcAtomic)}, vol ${compactUsd(r.metrics.volumeWindowUsdcAtomic)}, holders ${r.metrics.holderCount}, age ${ageLabel(r.ageSeconds)}${flags}\n   ${r.token.address}`;
      });
      return {
        reply:
          `${filtLine}\n${lines.join('\n')}\n` +
          `Screen, not a pick — these are observations, DYOR. Nothing here buys anything; the swap skill lands next.`,
      };
    },
  };
}
