/**
 * Swap chat skill: buy / sell / swap from plain language.
 *
 * Pipeline per message (all deterministic, all offline-testable):
 *   parse side+amount+token → resolve against the VERIFIED token map
 *   (unknown symbols are refused, never guessed) → price source quotes
 *   (the adapter never invents prices) → SwapRouterAdapter quote + simulate
 *   → HOLD replies on cost/price doubt → policy checkAction gate
 *   → numbered proposal → APPROVE executes via the desk approver, which
 *   re-reads the CURRENT policy and re-gates before settling.
 *
 * Money is exact: USDC amounts parse to 6dp atomic, token amounts to the
 * token's own decimals. Display formatting is compact dollars / token units.
 */

import {
  checkAction,
  compilePermissions,
} from '../../../packages/policy/src/index.ts';
import type { Policy } from '../../../packages/policy/src/index.ts';
import {
  SwapRouterAdapter,
  toAtomic,
} from '../../../packages/venues/src/index.ts';
import type { SwapQuote, SwapToken } from '../../../packages/venues/src/index.ts';
import type { Approver, PendingApproval, Skill } from './types.ts';

export interface VerifiedToken {
  symbol: string;
  address: string;
  decimals: number;
}

export interface RouterConfig {
  chainId: number;
  router: string;
  contract: string;
  selector: string;
}

export interface PriceQuote {
  quotedOutAtomic: bigint;
  gasUsdcAtomic: bigint;
  /** True when the quoter confirms output value covers gas. Never assumed. */
  coversGas: boolean;
}

export interface QuoteSource {
  getQuote(input: { tokenIn: SwapToken; tokenOut: SwapToken; amountInAtomic: bigint }): Promise<PriceQuote> | PriceQuote;
}

export interface PolicyProvider {
  activePolicy(): Policy | null;
}

export interface SwapSettlement {
  settle(input: {
    spaceId: string;
    quote: SwapQuote;
    policyVersion: number;
    minOutAtomic: bigint;
  }): Promise<string>;
}

export interface SwapDeskDeps {
  verifiedTokens: VerifiedToken[];
  router: RouterConfig;
  quotes: QuoteSource;
  policies: PolicyProvider;
  settlement: SwapSettlement;
  defaultSlippageBps: number;
  now: () => number;
}

type Side = 'buy' | 'sell' | 'swap';

/** Words that can never be a token ref (amounts are digits, not words). */
const SWAP_STOPWORDS = new Set([
  'buy', 'sell', 'swap', 'trade', 'ape', 'long', 'short', 'bid', 'dump', 'exit',
  'usdc', 'usd', 'dollars', 'of', 'for', 'to', 'into', 'in', 'with',
  'slippage', 'slip', 'top', 'sort', 'by', 'me', 'some', 'a', 'the',
]);

interface ParsedSwap {
  side: Side;
  amountRaw: string;
  amountIsUsdc: boolean;
  tokenRefA: string;
  tokenRefB: string | null;
  slippageBps: number;
}

function findVerified(refs: string[], verified: VerifiedToken[]): VerifiedToken | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^\$/, '');
  for (const ref of refs) {
    const hit = verified.find(
      (v) => v.symbol.toLowerCase() === norm(ref) || v.address.toLowerCase() === norm(ref),
    );
    if (hit) return hit;
  }
  return null;
}

function parseAmount(text: string): { raw: string; isUsdc: boolean } | null {
  const usdcFirst =
    /\$(\d[\d,]*(?:\.\d{1,6})?)/.exec(text) ??
    /(\d[\d,]*(?:\.\d{1,6})?)\s*(usdc|usd|dollars)\b/i.exec(text);
  if (usdcFirst) {
    const raw = (usdcFirst[1] ?? '').replace(/,/g, '');
    return { raw, isUsdc: true };
  }
  // Bare "<number> <SYM>" (e.g. SELL 10 TKN) resolves against the token map later.
  const bare = /(\d[\d,]*(?:\.\d+)?)\s*(?=\$?[A-Za-z]{2,12}\b|0x[0-9a-fA-F]{40})/.exec(text);
  if (bare) return { raw: bare[1].replace(/,/g, ''), isUsdc: false };
  return null;
}

/** Parse side + amount + token refs. Returns null when the text is not a swap. */
export function parseSwap(text: string, defaultSlippageBps: number): ParsedSwap | null {
  const lower = text.toLowerCase();
  let side: Side | null = null;
  if (/^\s*(buy|ape|long|bid)\b/.test(lower)) side = 'buy';
  else if (/^\s*(sell|short|dump|exit)\b/.test(lower)) side = 'sell';
  else if (/\b(swap|trade|convert|flip)\b/.test(lower)) side = 'swap';
  if (!side) return null;

  const slipM = /slippage\s*(\d+(?:\.\d+)?)\s*%|slip\s*(\d+(?:\.\d+)?)\s*%/i.exec(text);
  const slippageBps = slipM
    ? Math.round(parseFloat(slipM[1] ?? slipM[2] ?? '1') * 100)
    : defaultSlippageBps;

  if (side === 'swap') {
    const legs = /(\S+)\s+(?:for|to|into)\s+(\S+)/i.exec(text);
    const amount = parseAmount(text);
    if (!legs || !amount) return null;
    return { side, amountRaw: amount.raw, amountIsUsdc: amount.isUsdc, tokenRefA: legs[1], tokenRefB: legs[2], slippageBps };
  }
  // buy/sell: amount + one token ref; amount currency decided at resolve time.
  const amount = parseAmount(text);
  if (!amount) return null;
  // Token ref = $SYM, address, word after of/into/for, or a bare symbol word.
  // Resolution against the verified map happens later; unknown refs refuse.
  const cash = /\$([A-Za-z]{2,12})\b/.exec(text);
  const addrM = /(0x[0-9a-fA-F]{40})/.exec(text);
  const prep = /(?:\bof|\binto|\bfor|\bin)\s+\$?([A-Za-z]{2,12})\b/i.exec(text);
  const bareWord = (text.match(/[A-Za-z]{2,12}/g) ?? []).find(
    (w) => !SWAP_STOPWORDS.has(w.toLowerCase()),
  );
  const ref = cash?.[1] ?? addrM?.[1] ?? prep?.[1] ?? bareWord ?? '';
  if (!ref) return null;
  return { side, amountRaw: amount.raw, amountIsUsdc: amount.isUsdc, tokenRefA: ref, tokenRefB: null, slippageBps };
}

export function swapIntentMatches(text: string): boolean {
  return parseSwap(text, 100) !== null;
}

function toSwapToken(v: VerifiedToken): SwapToken {
  return { address: v.address, symbol: v.symbol, decimals: v.decimals, isFeeOnTransfer: false, isRebasing: false };
}

export function formatTokenAmount(atomic: bigint, decimals: number): string {
  let scale = 1n;
  for (let i = 0; i < decimals; i++) scale *= 10n;
  const neg = atomic < 0n;
  const abs = neg ? -atomic : atomic;
  const intPart = abs / scale;
  const frac = abs % scale;
  let out = intPart.toString();
  if (frac > 0n) {
    const digits = Math.min(decimals, 6);
    const fracStr = (frac * 10n ** BigInt(digits) / scale).toString().padStart(digits, '0').replace(/0+$/, '');
    if (fracStr.length > 0) out += `.${fracStr}`;
  }
  return neg ? `-${out}` : out;
}

function compactUsd(atomic: bigint): string {
  const abs = atomic < 0n ? -atomic : atomic;
  const v = Number(abs) / 1_000_000;
  const s = v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}m` : v >= 1_000 ? `${(v / 1_000).toFixed(2)}k` : v.toFixed(2);
  return `$${s}`;
}

interface CachedSwap {
  quote: SwapQuote;
  policyVersion: number;
  summary: string;
  /** USDC value at risk, fixed at quote time for a stable re-gate. */
  notionalUsdcAtomic: bigint;
}

export function createSwapDesk(deps: SwapDeskDeps): { skill: Skill; approver: Approver } {
  const adapter = new SwapRouterAdapter({ chainId: deps.router.chainId });
  const cache = new Map<string, CachedSwap>();
  let seq = 0;

  const usdc = (): VerifiedToken => {
    const hit = deps.verifiedTokens.find((v) => v.symbol.toUpperCase() === 'USDC');
    if (!hit) throw new Error('no USDC in verified token map');
    return hit;
  };

  const skill: Skill = {
    name: 'swap',
    description: 'Swap on Arc: BUY $50 OF TKN, SELL 10 TKN, SWAP 5 USDC FOR TKN. Approval-gated.',
    matches: (t) => swapIntentMatches(t),
    handle: async (ctx) => {
      const parsed = parseSwap(ctx.text, deps.defaultSlippageBps);
      if (!parsed) return { reply: 'Say BUY $50 OF TKN, SELL 10 TKN, or SWAP 5 USDC FOR TKN.' };
      const policy = deps.policies.activePolicy();
      if (!policy) {
        return { reply: 'No active trading policy. The owner sets one first — I never trade without versioned limits.' };
      }
      let tokenInV: VerifiedToken;
      let tokenOutV: VerifiedToken;
      let amountInAtomic: bigint;
      try {
        if (parsed.side === 'buy') {
          const target = findVerified([parsed.tokenRefA], deps.verifiedTokens);
          if (!target) return { reply: unknownTokenReply(parsed.tokenRefA, deps.verifiedTokens) };
          tokenInV = usdc();
          tokenOutV = target;
          amountInAtomic = toAtomic(parsed.amountRaw, 6);
        } else if (parsed.side === 'sell') {
          const target = findVerified([parsed.tokenRefA], deps.verifiedTokens);
          if (!target) return { reply: unknownTokenReply(parsed.tokenRefA, deps.verifiedTokens) };
          tokenInV = target;
          tokenOutV = usdc();
          amountInAtomic = parsed.amountIsUsdc ? toAtomic(parsed.amountRaw, 6) : toAtomic(parsed.amountRaw, target.decimals);
        } else {
          const a = findVerified([parsed.tokenRefA], deps.verifiedTokens);
          const b = findVerified([parsed.tokenRefB ?? ''], deps.verifiedTokens);
          if (!a) return { reply: unknownTokenReply(parsed.tokenRefA, deps.verifiedTokens) };
          if (!b) return { reply: unknownTokenReply(parsed.tokenRefB ?? '', deps.verifiedTokens) };
          tokenInV = a;
          tokenOutV = b;
          amountInAtomic = parsed.amountIsUsdc ? toAtomic(parsed.amountRaw, 6) : toAtomic(parsed.amountRaw, a.decimals);
        }
      } catch {
        return { reply: 'I could not parse that amount exactly. State it plainly, e.g. BUY $50 OF TKN.' };
      }
      if (amountInAtomic <= 0n) return { reply: 'Amount must be greater than zero.' };

      let price: PriceQuote;
      try {
        price = await deps.quotes.getQuote({ tokenIn: toSwapToken(tokenInV), tokenOut: toSwapToken(tokenOutV), amountInAtomic });
      } catch (err) {
        return { reply: `No live quote right now: ${err instanceof Error ? err.message : 'quoter unavailable'}. Nothing quoted.` };
      }

      let quote: SwapQuote;
      try {
        quote = adapter.quoteSwap({
          chainId: deps.router.chainId,
          router: deps.router.router,
          tokenIn: toSwapToken(tokenInV),
          tokenOut: toSwapToken(tokenOutV),
          amountInAtomic,
          quotedOutAtomic: price.quotedOutAtomic,
          slippageBps: parsed.slippageBps,
          priceImpactBps: 100,
          gasUsdcAtomic: price.gasUsdcAtomic,
          quoteAgeSeconds: 5,
          dataAgeSeconds: 10,
          expiresAtSeconds: deps.now() + 60,
          nowSeconds: deps.now(),
        });
      } catch (err) {
        return { reply: `Quote rejected: ${err instanceof Error ? err.message : 'invalid quote'}. Nothing quoted.` };
      }

      const sim = adapter.simulateSwap(quote, { coversGas: price.coversGas });
      if (sim.decision === 'HOLD') {
        return { reply: `HOLD: ${sim.holdReason}. Nothing quoted for execution.` };
      }

      // Gate notional is USDC value at risk (sells quote token atomic units,
      // which are meaningless against the USDC-denominated position cap).
      const notionalUsdcAtomic = tokenInV.symbol === 'USDC' ? amountInAtomic : quote.quotedOutAtomic;
      const shape = adapter.toPolicyActionShape(quote, {
        contract: deps.router.contract,
        selector: deps.router.selector,
        gasAtomic: price.gasUsdcAtomic,
        notionalUsdcAtomic,
      });
      const gate = checkAction(compilePermissions(policy), {
        type: shape.type,
        pool: shape.pool,
        contract: shape.contract,
        selector: shape.selector,
        tokensTouched: shape.tokensTouched,
        notionalAtomic: shape.notionalAtomic,
        slippageBps: shape.slippageBps,
        priceImpactBps: shape.priceImpactBps,
        gasAtomic: shape.gasAtomic,
        quoteAgeSeconds: shape.quoteAgeSeconds,
        dataAgeSeconds: shape.dataAgeSeconds,
      });
      if (!gate.ok) {
        return { reply: `Blocked by your policy (v${policy.version}): ${gate.violations.map((v) => v.code).join(', ')}. Nothing quoted.` };
      }

      seq += 1;
      const id = `SW${seq}`;
      const inLabel = tokenInV.symbol === 'USDC' ? compactUsd(amountInAtomic) + ' USDC' : `${formatTokenAmount(amountInAtomic, tokenInV.decimals)} ${tokenInV.symbol}`;
      const outLabel = tokenOutV.symbol === 'USDC' ? `≥ ${compactUsd(quote.minOutAtomic)} USDC` : `≥ ${formatTokenAmount(quote.minOutAtomic, tokenOutV.decimals)} ${tokenOutV.symbol}`;
      const summary =
        `Swap ${inLabel} → ${outLabel} (slippage ${(parsed.slippageBps / 100).toFixed(2)}%, gas ~${compactUsd(price.gasUsdcAtomic)}, quote valid 60s, policy v${policy.version})`;
      cache.set(`${ctx.spaceId}:${id}`, { quote, policyVersion: policy.version, summary, notionalUsdcAtomic });
      return {
        reply: `${summary}\nReply APPROVE ${id} or REJECT ${id}. Nothing has been submitted.`,
        pendingApproval: { id, skill: 'swap', summary, createdAtSeconds: deps.now(), data: { kind: 'swap' } },
      };
    },
  };

  const approver: Approver = {
    execute: async (spaceId: string, approval: PendingApproval) => {
      const cached = cache.get(`${spaceId}:${approval.id}`);
      if (!cached || approval.skill !== 'swap') {
        return `Proposal ${approval.id} is unknown or expired. Nothing was executed.`;
      }
      cache.delete(`${spaceId}:${approval.id}`);
      if (cached.quote.expiresAtSeconds <= deps.now()) {
        return `Quote for proposal ${approval.id} expired. Re-quote first — nothing was executed.`;
      }
      const policy = deps.policies.activePolicy();
      if (!policy || policy.version !== cached.policyVersion) {
        return `Policy changed since proposal ${approval.id} (v${cached.policyVersion}). New approval required — nothing was executed.`;
      }
      const shape = adapter.toPolicyActionShape(cached.quote, {
        contract: deps.router.contract,
        selector: deps.router.selector,
        gasAtomic: cached.quote.gasUsdcAtomic,
        notionalUsdcAtomic: cached.notionalUsdcAtomic,
      });
      const gate = checkAction(compilePermissions(policy), {
        type: shape.type,
        pool: shape.pool,
        contract: shape.contract,
        selector: shape.selector,
        tokensTouched: shape.tokensTouched,
        notionalAtomic: shape.notionalAtomic,
        slippageBps: shape.slippageBps,
        priceImpactBps: shape.priceImpactBps,
        gasAtomic: shape.gasAtomic,
        quoteAgeSeconds: shape.quoteAgeSeconds,
        dataAgeSeconds: shape.dataAgeSeconds,
      });
      if (!gate.ok) {
        return `Policy re-gate failed for ${approval.id}: ${gate.violations.map((v) => v.code).join(', ')}. Nothing was executed.`;
      }
      return deps.settlement.settle({
        spaceId,
        quote: cached.quote,
        policyVersion: policy.version,
        minOutAtomic: cached.quote.minOutAtomic,
      });
    },
  };

  return { skill, approver };
}

function unknownTokenReply(ref: string, verified: VerifiedToken[]): string {
  const known = verified.map((v) => v.symbol).join(', ') || 'none yet';
  return `I don't know ${ref || 'that token'}. Tradable: ${known}. The owner adds verified tokens — I never guess addresses.`;
}
