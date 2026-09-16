/**
 * Typed goal parsing (PLAN.md §3 "Set a goal", §4 modes).
 *
 * The language model interprets preferences; THIS module validates them into
 * a typed draft. Output is a draft + clarifying questions — never an assumed
 * permission. Missing amounts, token eligibility, or limits produce questions;
 * extra capital is never inferred.
 */

export const GOAL_MODES = ['Calm', 'Balanced', 'Aggressive', 'Custom'] as const;
export type GoalMode = (typeof GOAL_MODES)[number];

export interface GoalDraft {
  mode: GoalMode;
  /** USDC budget in atomic (6dp), or null when the user has not stated it. */
  capitalBudgetUsdcAtomic: bigint | null;
  /** Reserve fraction in bps (e.g. 3000 = 30%), or null when unstated. */
  reserveBps: number | null;
  /** Per-position cap in bps, or null when unstated. */
  maxPositionBps: number | null;
  /** Token symbols mentioned (never addresses — resolution needs an allowlist). */
  mentionedTokens: string[];
  avoidNewPools: boolean;
  askBeforeNewPool: boolean;
  wantsCustom: boolean;
}

export interface ParseResult {
  draft: GoalDraft;
  /** Blocking questions that must be answered before a policy can be proposed. */
  questions: string[];
}

const USDC_ATOMIC = 1_000_000n;

function parseUsdcAmount(text: string): bigint | null {
  // Matches "$500", "500 USDC", "500 dollars" (integers/decimals, no floats-in-code).
  const m = /\$?\s*(\d{1,9}(?:\.\d{1,6})?)\s*(usdc|dollars|usd|\$)?/i.exec(text);
  if (!m) return null;
  // Require an explicit money marker so "30%" is never read as capital.
  if (!m[2]) {
    const withMarker = /\$(\d[\d,]*(?:\.\d{1,6})?)|(\d[\d,]*(?:\.\d{1,6})?)\s*(usdc|usd|dollars)/i.exec(text);
    if (!withMarker) return null;
    const raw = (withMarker[1] ?? withMarker[2] ?? '').replace(/,/g, '');
    return usdcStrToAtomic(raw);
  }
  const raw = m[1].replace(/,/g, '');
  // If the only number is part of a percent ("30%"), it has no money marker match above.
  if (/%/.test(text.slice(Math.max(0, (m.index ?? 0) - 2), (m.index ?? 0) + m[0].length + 1))) {
    const marked = /\$(\d[\d,]*(?:\.\d{1,6})?)|(\d[\d,]*(?:\.\d{1,6})?)\s*(usdc|usd|dollars)/i.exec(text);
    if (!marked) return null;
    return usdcStrToAtomic((marked[1] ?? marked[2] ?? '').replace(/,/g, ''));
  }
  return usdcStrToAtomic(raw);
}

function usdcStrToAtomic(raw: string): bigint | null {
  const parts = raw.split('.');
  if (parts.length > 2) return null;
  const intPart = BigInt(parts[0] === '' ? '0' : parts[0]);
  const fracStr = (parts[1] ?? '') + '000000';
  const frac = BigInt(fracStr.slice(0, 6) || '0');
  if (intPart < 0n) return null;
  return intPart * USDC_ATOMIC + frac;
}

function parsePercentBps(text: string, keywords: string[]): number | null {
  for (const kw of keywords) {
    const idx = text.toLowerCase().indexOf(kw);
    if (idx >= 0) {
      const window = text.slice(Math.max(0, idx - 12), idx + kw.length + 12);
      const m = /(\d{1,3}(?:\.\d{1,2})?)\s*%/.exec(window);
      if (m) return Math.round(parseFloat(m[1]) * 100);
      const m2 = /(\d{1,3}(?:\.\d{1,2})?)\s*percent/i.exec(window);
      if (m2) return Math.round(parseFloat(m2[1]) * 100);
    }
  }
  return null;
}

/** Parse a free-text goal into a typed draft + blocking questions. Pure. */
export function parseGoal(input: string): ParseResult {
  const text = input.trim();
  const lower = text.toLowerCase();
  const questions: string[] = [];

  let mode: GoalMode = 'Balanced';
  if (/\baggressive\b/.test(lower)) mode = 'Aggressive';
  else if (/\bcalm\b|\bconservative\b|\bcautious\b/.test(lower)) mode = 'Calm';
  else if (/\bcustom\b/.test(lower)) mode = 'Custom';

  const capitalBudgetUsdcAtomic = parseUsdcAmount(text);

  const reserveBps =
    parsePercentBps(lower, ['reserve', 'in usdc', 'keep', 'hold back', 'cash']) ??
    (/\bkeep\b.*\busdc\b/i.test(text) ? null : null);

  const maxPositionBps =
    parsePercentBps(lower, ['per position', 'per-position', 'position to', 'any one position', 'each position']) ??
    parsePercentBps(lower, ['limit']);

  const mentionedTokens: string[] = [];
  for (const sym of ['usdc', 'weth', 'eth', 'wbtc', 'btc']) {
    if (new RegExp(`\\b${sym}\\b`, 'i').test(text)) mentionedTokens.push(sym.toUpperCase());
  }

  const avoidNewPools = /\bavoid\b.*\b(new|newly|launch)/i.test(text) || /\bno new pools\b/i.test(text) || /\bexclude.*new\b/i.test(text);
  const askBeforeNewPool = /\bask\b.*\b(new|swap|pool)/i.test(text) || /\bask me\b/i.test(text) || /\bbefore.*(new|swap)/i.test(text);
  const wantsCustom = mode === 'Custom' || /\bcustom\b/i.test(text);

  if (capitalBudgetUsdcAtomic === null) {
    questions.push('How much USDC should Flo work with? State an explicit amount (never inferred).');
  }
  if (mentionedTokens.length === 0 && (avoidNewPools || /token/i.test(text))) {
    questions.push('Which tokens may Flo touch? Name them explicitly; new/volatile assets need opt-in.');
  } else if (mentionedTokens.length === 0) {
    questions.push('Which tokens are eligible? Name them explicitly (e.g. USDC and WETH).');
  }
  if (reserveBps === null) {
    questions.push('How much USDC should stay in reserve (percent)? Unstated reserves are not assumed.');
  }
  if (maxPositionBps === null) {
    questions.push('What is the maximum for any single position (percent of budget)?');
  }
  if (!avoidNewPools && !askBeforeNewPool) {
    questions.push('May Flo propose new pools — never, or propose-and-ask-first? (MVP always asks before acting.)');
  }

  return {
    draft: {
      mode,
      capitalBudgetUsdcAtomic,
      reserveBps,
      maxPositionBps,
      mentionedTokens,
      avoidNewPools,
      askBeforeNewPool,
      wantsCustom,
    },
    questions,
  };
}

/**
 * Mode-direction draft defaults for caps the user did not state (PLAN.md §4:
 * design directions, NOT validated optima). Clearly labeled drafts — the user
 * must still approve the versioned policy before anything can be proposed.
 */
export const DRAFT_DEFAULTS: Record<GoalMode, { maxPositionBps: number; reserveBps: number }> = {
  Calm: { maxPositionBps: 500, reserveBps: 5000 },
  Balanced: { maxPositionBps: 1000, reserveBps: 3000 },
  Aggressive: { maxPositionBps: 2000, reserveBps: 1000 },
  Custom: { maxPositionBps: 1000, reserveBps: 3000 },
};
