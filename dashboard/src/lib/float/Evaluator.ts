/**
 * FLOAT Evaluator — Actor-Critic Review System
 * 
 * The Actor (Llama 3.3) explains decisions to the user.
 * The Critic (Gemma 2 9B) reviews batches of past decisions and recommends
 * parameter adjustments. It does NOT directly control execution.
 * 
 * This is RLAIF (Reinforcement Learning from AI Feedback) adapted for DeFi.
 */

import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import type { DecisionLog, DecisionOutcome, StrategyConfig } from './types';

// ─── Actor: Explains a decision in natural language ─────────────
export async function explainDecision(decision: DecisionLog): Promise<string> {
  try {
    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `You are FLOAT, a capital efficiency agent. Explain this routing decision in ONE clear sentence for a dashboard. Be specific with numbers.

Decision:
- Agent: ${decision.agentId} (${decision.agentState})
- Action: ${decision.action} ${decision.amount > 0 ? `$${decision.amount.toFixed(2)}` : ''}
- Score: ${decision.parkabilityScore.toFixed(2)}
- Liquid: $${decision.liquidBefore.toFixed(2)} → $${decision.liquidAfter.toFixed(2)}
- Parked: $${decision.parkedBefore.toFixed(2)} → $${decision.parkedAfter.toFixed(2)}
- Reason: ${decision.reason}

One sentence explanation:`,
      maxOutputTokens: 80,
    });
    return text.trim();
  } catch (err: any) {
    return decision.reason; // Fallback to rule-based reason
  }
}

// ─── Critic: Reviews batch of decisions and recommends changes ──
export interface CriticReview {
  finding: string;
  suggestedChanges: Partial<StrategyConfig>;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

export async function reviewDecisions(
  decisions: DecisionLog[],
  currentConfig: StrategyConfig,
): Promise<CriticReview | null> {
  if (decisions.length < 5) return null; // Need enough data

  const withOutcomes = decisions.filter(d => d.outcome);
  if (withOutcomes.length < 3) return null;

  const goodDecisions = withOutcomes.filter(d => d.outcome!.wasGoodDecision);
  const badDecisions = withOutcomes.filter(d => !d.outcome!.wasGoodDecision);
  const accuracy = goodDecisions.length / withOutcomes.length;

  try {
    const { text } = await generateText({
      model: groq('llama-3.1-8b-instant'), // Different model = independent reviewer
      prompt: `You are a DeFi capital efficiency critic. Review these FLOAT routing decisions and suggest ONE specific parameter change.

Current strategy: ${JSON.stringify(currentConfig, null, 2)}

Accuracy: ${(accuracy * 100).toFixed(0)}% (${goodDecisions.length}/${withOutcomes.length} good)

Top 3 GOOD decisions:
${goodDecisions.slice(0, 3).map(d => `- ${d.action} $${d.amount.toFixed(2)} | Score: ${d.parkabilityScore.toFixed(2)} | Yield: $${d.outcome!.yieldEarned.toFixed(4)} | ${d.reason}`).join('\n')}

Top 3 BAD decisions:
${badDecisions.slice(0, 3).map(d => `- ${d.action} $${d.amount.toFixed(2)} | Score: ${d.parkabilityScore.toFixed(2)} | Trade missed: ${d.outcome!.tradeMissed} | ${d.reason}`).join('\n')}

Respond in EXACTLY this JSON format:
{"finding": "one sentence finding", "parameterToChange": "key from strategy config", "oldValue": number, "newValue": number, "confidence": "low|medium|high", "reasoning": "why"}`,
      maxOutputTokens: 200,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const changes: Partial<StrategyConfig> = {};
    if (parsed.parameterToChange && parsed.newValue !== undefined) {
      (changes as any)[parsed.parameterToChange] = parsed.newValue;
    }

    return {
      finding: parsed.finding || 'No finding',
      suggestedChanges: changes,
      confidence: parsed.confidence || 'low',
      reasoning: parsed.reasoning || '',
    };
  } catch (err: any) {
    console.error('[CRITIC] Review failed:', err.message);
    return null;
  }
}

// ─── Evaluate a past decision against its outcome ───────────────
export function evaluateDecision(
  decision: DecisionLog,
  currentParked: number,
  tradeMissed: boolean,
  recallNeeded: boolean,
  recallLatencyMs?: number,
): DecisionOutcome {
  let score = 0;
  
  // Real-time Yield calculation based on 5.15% APY of USYC
  let yieldEarned = 0;
  if (decision.action === 'PARK' && decision.parkedAfter > 0) {
    const elapsedMs = Date.now() - new Date(decision.timestamp).getTime();
    const elapsedYears = elapsedMs / (1000 * 60 * 60 * 24 * 365.25);
    yieldEarned = decision.parkedAfter * 0.0515 * elapsedYears;
  }

  if (decision.action === 'PARK') {
    if (!tradeMissed && !recallNeeded) {
      score = 1; // Parked and no disruption = great
    } else if (recallNeeded && !tradeMissed) {
      score = 0; // Had to recall but didn't miss = neutral
    } else if (tradeMissed) {
      score = -1; // Parked and missed a trade = terrible
    }
  } else if (decision.action === 'HOLD') {
    // Was holding the right call? Check if parking would have earned yield
    score = tradeMissed ? 0 : -0.3; // Missed yield opportunity
  } else if (decision.action === 'WITHDRAW') {
    if (tradeMissed) {
      score = -1; // Withdrew too late
    } else {
      score = recallNeeded ? 1 : 0; // Withdrew preemptively = good if needed
    }
  }

  return {
    evaluatedAt: new Date().toISOString(),
    yieldEarned,
    tradeMissed,
    recallNeeded,
    recallLatencyMs,
    wasGoodDecision: score > 0,
    score,
  };
}
