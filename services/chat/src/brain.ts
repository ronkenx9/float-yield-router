/**
 * The LLM brain: OpenAI chat completions + a fake for offline tests.
 *
 * The brain DRAFTS replies and may suggest one validated skill action. It
 * never executes, never signs, never sees keys. The shell validates any
 * suggested action against the registered skill list and drops unknown ones.
 *
 * Key handling: read from `OPENAI_API_KEY` at call time, sent as a bearer
 * header, never logged or stored. Missing key → honest "brain not
 * configured" error the shell turns into a plain reply.
 */

import type { Brain, BrainResult, Skill, SkillContext } from './types.ts';

export interface OpenAIBrainOpts {
  model: string;
  systemPrompt: string;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
}

export const FLO_SYSTEM_PROMPT = [
  'You are Flo, the FLOAT liquidity-agent assistant on Arc.',
  'You explain positions, fees, and proposals in plain language.',
  'You never promise returns, safety, or execution prices.',
  'Simulations are labeled as simulations, never forecasts.',
  'Money moves only after the user replies APPROVE <id> to a numbered proposal.',
  'If asked to do something outside your registered skills, say so plainly.',
].join(' ');

export class OpenAIBrain implements Brain {
  private readonly opts: OpenAIBrainOpts;

  constructor(opts: OpenAIBrainOpts) {
    this.opts = opts;
  }

  async draftReply(ctx: SkillContext, skills: Skill[]): Promise<BrainResult> {
    const key = this.opts.env['OPENAI_API_KEY'];
    if (!key) throw new Error('BRAIN_NOT_CONFIGURED: set OPENAI_API_KEY');
    const skillList = skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
    const history = ctx.history.slice(-8).map((h) => ({
      role: h.role,
      content: h.text,
    }));
    const res = await (this.opts.fetchFn ?? fetch)('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages: [
          { role: 'system', content: `${this.opts.systemPrompt}\nRegistered skills (suggest at most one as {"skill": name, "args": text}):\n${skillList}` },
          ...history,
          { role: 'user', content: ctx.text },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    if (!res.ok) throw new Error(`BRAIN_UPSTREAM_${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('BRAIN_EMPTY_REPLY');
    }
    return { text: content.trim().slice(0, 3000), action: extractAction(content, skills) };
  }
}

/** Pull a trailing {"skill": ..., "args": ...} hint out of brain text, if valid. */
export function extractAction(text: string, skills: Skill[]): BrainResult['action'] {
  const m = /\{[^{}]*"skill"[^{}]*\}/.exec(text);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as { skill?: unknown; args?: unknown };
    if (typeof parsed.skill !== 'string') return null;
    const found = skills.some((s) => s.name === parsed.skill);
    if (!found) return null;
    return { skill: parsed.skill, args: typeof parsed.args === 'string' ? parsed.args : '' };
  } catch {
    return null;
  }
}

/** Deterministic stand-in for offline tests. */
export class FakeBrain implements Brain {
  private readonly reply: string;
  constructor(reply = 'Flo here. Try HELP for what I can do.') {
    this.reply = reply;
  }
  async draftReply(): Promise<BrainResult> {
    return { text: this.reply, action: null };
  }
}
