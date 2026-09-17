/**
 * Evidence-backed explanations (PLAN.md §5).
 *
 * Explanations READ the ledger — receipts, policy versions, simulations —
 * never the reverse. Every number cited must be passed in; nothing is
 * invented. Simulations are labeled as simulations, not forecasts.
 */

export interface ExplanationInputs {
  kind: 'proposal' | 'execution' | 'hold' | 'performance';
  policyVersion: number;
  pool: string | null;
  action: string | null;
  amountUsdc: string | null;
  pessimisticFeesUsdc: string | null;
  costsUsdc: string | null;
  netUsdc: string | null;
  txHash: string | null;
  holdReason: string | null;
  extra: string[];
}

export function explain(e: ExplanationInputs): string[] {
  const lines: string[] = [];
  const amt = (v: string | null) => (v === null ? 'n/a' : v);
  if (e.kind === 'proposal') {
    lines.push(
      `Proposal (${e.action ?? 'n/a'}${e.pool ? ` on ${e.pool}` : ''}): ${amt(e.amountUsdc)} USDC ` +
        `(policy v${e.policyVersion}). Simulation, not a forecast: pessimistic fees ${amt(e.pessimisticFeesUsdc)}, ` +
        `costs ${amt(e.costsUsdc)}, net ${amt(e.netUsdc)}. Nothing has been submitted.`,
    );
  } else if (e.kind === 'execution') {
    lines.push(
      `Executed ${e.action ?? 'n/a'}${e.pool ? ` on ${e.pool}` : ''}: ${amt(e.amountUsdc)} USDC ` +
        `(policy v${e.policyVersion})${e.txHash ? ` — receipt ${e.txHash}` : ' — receipt pending'}. ` +
        `Use the receipt, not this message, as the source of truth.`,
    );
  } else if (e.kind === 'hold') {
    lines.push(
      `HOLD${e.pool ? ` on ${e.pool}` : ''} (policy v${e.policyVersion}): ${e.holdReason ?? 'no change proposed'}. ` +
        `Doing nothing is the cost-aware decision here.`,
    );
  } else {
    lines.push(
      `Performance (policy v${e.policyVersion}): net ${amt(e.netUsdc)} USDC after fees ${amt(e.pessimisticFeesUsdc)} ` +
        `and costs ${amt(e.costsUsdc)}. After-cost, benchmarked results live in the ledger.`,
    );
  }
  for (const x of e.extra) lines.push(x);
  return lines;
}
