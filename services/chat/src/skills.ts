/**
 * Built-in chat skills (chat shell first slice).
 *
 * Deterministic intents own exact commands; everything else falls through to
 * the brain. Skills answer from the existing services' evidence (agent
 * explanations, ledger shapes) and raise numbered approvals for anything
 * that would move money. Swap / launch / screener skills plug in here next.
 */

import type { Skill, SkillContext, SkillResult } from './types.ts';

export const HELP_TEXT = [
  'Flo on Arc — what I can do today:',
  '',
  'HELP — this list',
  'STATUS — your LP positions and net result after costs',
  'PAUSE — stop future proposals (does not unwind positions)',
  'APPROVE <id> / REJECT <id> — decide on a numbered proposal',
  '',
  'SCREEN <filters> — find memecoins by parameters (e.g. SCREEN liq over $50k vol over $5k 200+ holders older than 7 days)',
  'BUY $50 OF TKN / SELL 10 TKN / SWAP 5 USDC FOR TKN — quote a swap (approval-gated)',
  '',
  'Coming next: launch from chat.',
  'I never move money without an APPROVE. Capital at risk.',
].join('\n');

export function helpSkill(): Skill {
  return {
    name: 'help',
    description: 'List what Flo can do in chat.',
    matches: (t) => /^\s*(help|commands|what can you do|\?)\s*\??\s*$/i.test(t),
    handle: () => ({ reply: HELP_TEXT }),
  };
}

export interface StatusProvider {
  /** Evidence-backed status text (built by the caller from ledger data). */
  statusText(ctx: SkillContext): Promise<string> | string;
}

export function statusSkill(provider: StatusProvider): Skill {
  return {
    name: 'status',
    description: 'Report LP positions and net result after costs.',
    matches: (t) => /^\s*(status|positions|pnl|p&l|how am i doing)\s*\??\s*$/i.test(t),
    handle: async (ctx) => ({ reply: await provider.statusText(ctx) }),
  };
}

export interface PauseHandler {
  pause(spaceId: string): Promise<string> | string;
}

export function pauseSkill(handler: PauseHandler): Skill {
  return {
    name: 'pause',
    description: 'Pause future proposals. Does not unwind existing exposure.',
    matches: (t) => /^\s*(pause|stop|halt)\b/i.test(t),
    handle: async (ctx) => ({
      reply: await handler.pause(ctx.spaceId),
    }),
  };
}

export interface ApprovalStore {
  list(spaceId: string): Array<{ id: string; summary: string }>;
  resolve(spaceId: string, id: string, approve: boolean): string;
}

/** APPROVE <id> / REJECT <id> — the only path that authorizes money movement. */
export function approvalSkill(store: ApprovalStore): Skill {
  return {
    name: 'approval',
    description: 'Approve or reject a numbered proposal: APPROVE <id> or REJECT <id>.',
    matches: (t) => /^\s*(approve|reject|yes|no)\b/i.test(t),
    handle: (ctx) => {
      const m = /^\s*(approve|reject|yes|no)\s*([A-Za-z0-9-_]+)?\s*$/i.exec(ctx.text);
      if (!m) return { reply: 'Say APPROVE <id> or REJECT <id> — e.g. APPROVE 3.' };
      const verb = m[1].toLowerCase();
      const id = (m[2] ?? '').trim();
      if (!id) {
        const pending = store.list(ctx.spaceId);
        if (pending.length === 0) return { reply: 'No pending proposals. Nothing to approve.' };
        return {
          reply: `Pending:\n${pending.map((p) => `${p.id}: ${p.summary}`).join('\n')}\nReply APPROVE <id> or REJECT <id>.`,
        };
      }
      const approve = verb === 'approve' || verb === 'yes';
      return { reply: store.resolve(ctx.spaceId, id, approve) };
    },
  };
}

/** Fallback used when no skill matches and the brain is unconfigured. */
export function fallbackReply(): SkillResult {
  return {
    reply:
      'I can help with HELP, STATUS, PAUSE, and APPROVE/REJECT <id>. ' +
      'Anything else needs my full brain, which is not configured in this chat yet.',
  };
}
