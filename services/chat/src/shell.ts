/**
 * The chat shell: inbound → allowlist → dedupe → skill-or-brain → reply.
 *
 * Safety order (PLAN.md §5, §9 applied to chat):
 * 1. Unknown senders are refused with zero data — no balances, no summaries.
 * 2. Duplicate deliveries (Photon at-least-once) are acknowledged silently.
 * 3. Deterministic skills own exact commands; the brain drafts the rest.
 * 4. Brain-suggested actions are validated against registered skills.
 * 5. Money moves only through APPROVE <id> → injected approver callback.
 */

import type {
  Brain,
  InboundMessage,
  OutboundReply,
  PendingApproval,
  Approver,
  ShellConfig,
  Skill,
  SkillContext,
  Transport,
} from './types.ts';
import { chunkText } from './types.ts';
import { fallbackReply } from './skills.ts';

export type { Approver };

interface Session {
  spaceId: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  pending: Map<string, PendingApproval>;
  seq: number;
}

export class ChatShell {
  private readonly config: ShellConfig;
  private readonly transport: Transport;
  private readonly brain: Brain;
  private readonly skills: Skill[];
  private readonly approver: Approver | null;
  private readonly sessions = new Map<string, Session>();
  private readonly seen: string[] = [];
  private readonly seenSet = new Set<string>();

  constructor(
    config: ShellConfig,
    transport: Transport,
    brain: Brain,
    skills: Skill[],
    approver: Approver | null = null,
  ) {
    this.config = config;
    this.transport = transport;
    this.brain = brain;
    this.skills = skills;
    this.approver = approver;
  }

  private owners(): Set<string> {
    return new Set(this.config.ownerIds.map((o) => o.trim().toLowerCase()));
  }

  private session(spaceId: string): Session {
    let s = this.sessions.get(spaceId);
    if (!s) {
      s = { spaceId, history: [], pending: new Map(), seq: 0 };
      this.sessions.set(spaceId, s);
    }
    return s;
  }

  /** Raise a numbered proposal the user can APPROVE. Returns the chat line. */
  propose(spaceId: string, skill: string, summary: string): string {
    const s = this.session(spaceId);
    s.seq += 1;
    const id = String(s.seq);
    s.pending.set(id, {
      id,
      skill,
      summary,
      createdAtSeconds: this.config.now(),
    });
    return `Proposal ${id} (${skill}): ${summary}\nReply APPROVE ${id} or REJECT ${id}. Nothing has been submitted.`;
  }

  pendingFor(spaceId: string): Array<{ id: string; summary: string }> {
    const s = this.sessions.get(spaceId);
    if (!s) return [];
    return [...s.pending.values()].map((p) => ({ id: p.id, summary: p.summary }));
  }

  resolveApproval(spaceId: string, id: string, approve: boolean): string {
    const s = this.sessions.get(spaceId);
    const p = s?.pending.get(id);
    if (!p) return `No pending proposal ${id}. Nothing was approved or executed.`;
    s!.pending.delete(id);
    if (!approve) return `Proposal ${id} rejected. Nothing was executed.`;
    if (!this.approver) return `Proposal ${id} approved, but no executor is wired in this chat yet. Nothing was executed.`;
    // Execution is async; the shell acknowledges now and delivers the receipt
    // as a follow-up message (never blocks the webhook reply path).
    void this.approver
      .execute(spaceId, p)
      .then((line) => this.transport.send(spaceId, chunkText(line)))
      .catch((err: unknown) =>
        this.transport.send(spaceId, chunkText(`Proposal ${id} failed safely: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was executed.`)),
      );
    return `Proposal ${id} approved — executing now. I will reply with the receipt.`;
  }

  private remember(text: Session['history'][number], s: Session): void {
    s.history.push(text);
    const max = this.config.maxHistoryTurns * 2;
    if (s.history.length > max) s.history.splice(0, s.history.length - max);
  }

  private markSeen(key: string): boolean {
    if (this.seenSet.has(key)) return true;
    this.seenSet.add(key);
    this.seen.push(key);
    while (this.seen.length > this.config.maxDedupeKeys) {
      const old = this.seen.shift();
      if (old) this.seenSet.delete(old);
    }
    return false;
  }

  /** Handle one inbound message; always resolves (webhook path must not throw). */
  async handleInbound(msg: InboundMessage): Promise<OutboundReply> {
    const replyTo = (text: string): OutboundReply => ({ spaceId: msg.spaceId, chunks: chunkText(text) });

    if (this.markSeen(msg.dedupeKey)) {
      return { spaceId: msg.spaceId, chunks: [] }; // duplicate delivery: ack silently
    }
    if (!this.owners().has(msg.senderId.trim().toLowerCase())) {
      return replyTo('This Flo chat is private to its owner. If that should be you, ask the owner to authorize this sender.');
    }

    const s = this.session(msg.spaceId);
    this.remember({ role: 'user', text: msg.text }, s);
    const ctx: SkillContext = {
      spaceId: msg.spaceId,
      platform: msg.platform,
      senderId: msg.senderId,
      text: msg.text,
      history: [...s.history.slice(0, -1)],
    };

    // Approval commands resolve against THIS session's pending list first.
    if (/^\s*(approve|reject|yes|no)\b/i.test(msg.text)) {
      const m = /^\s*(approve|reject|yes|no)\s*([A-Za-z0-9-_]+)?\s*$/i.exec(msg.text);
      const id = (m?.[2] ?? '').trim();
      if (id && s.pending.has(id)) {
        const approve = /^(approve|yes)$/i.test(m![1]);
        const line = this.resolveApproval(msg.spaceId, id, approve);
        this.remember({ role: 'assistant', text: line }, s);
        return replyTo(line);
      }
    }

    for (const skill of this.skills) {
      if (skill.matches(msg.text)) {
        try {
          const result = await skill.handle(ctx);
          if (result.pendingApproval) {
            s.pending.set(result.pendingApproval.id, result.pendingApproval);
          }
          this.remember({ role: 'assistant', text: result.reply }, s);
          return replyTo(result.reply);
        } catch (err) {
          const line = `That failed safely: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was executed.`;
          this.remember({ role: 'assistant', text: line }, s);
          return replyTo(line);
        }
      }
    }

    try {
      const drafted = await this.brain.draftReply(ctx, this.skills);
      if (drafted.action) {
        const skill = this.skills.find((x) => x.name === drafted.action!.skill);
        if (skill) {
          const result = await skill.handle({ ...ctx, text: drafted.action.args || ctx.text });
          this.remember({ role: 'assistant', text: result.reply }, s);
          return replyTo(result.reply);
        }
      }
      this.remember({ role: 'assistant', text: drafted.text }, s);
      return replyTo(drafted.text);
    } catch {
      const fb = fallbackReply();
      this.remember({ role: 'assistant', text: fb.reply }, s);
      return replyTo(fb.reply);
    }
  }
}
