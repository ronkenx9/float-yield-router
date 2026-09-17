/**
 * The FLOAT policy contract (PLAN.md §4).
 *
 * A Policy is the enforceable translation of a user's goal ("keep 30% in USDC,
 * ask before new pools"). The agent may only ever act within it. The in-memory
 * shape uses bigint for atomic money; `SerializedPolicy` is the on-the-wire
 * shape (decimal strings) used for storage and approval digests.
 */

export const MODES = ['Calm', 'Balanced', 'Aggressive', 'Custom'] as const;
export type Mode = (typeof MODES)[number];

/**
 * MVP requires the user to sign every action ('per_action'). 'automated' is a
 * later, separately-gated release (PLAN.md §5, M6) and is rejected by the MVP
 * validator.
 */
export const APPROVAL_MODES = ['per_action', 'automated'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const PAUSE_STATES = ['active', 'paused'] as const;
export type PauseState = (typeof PAUSE_STATES)[number];

/** The proposed on-chain actions a strategy can emit, each gated by an allow-flag. */
export const ACTION_TYPES = ['ENTER', 'RANGE_CHANGE', 'COLLECT', 'EXIT'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface Policy {
  policyId: string;
  version: number;
  userId: string;
  chainId: number;
  effectiveAt: number; // unix seconds
  expiresAt: number; // unix seconds

  mode: Mode;
  accountAddress: string;
  capitalBudgetUsdcAtomic: bigint;

  allowedTokens: string[];
  allowedPools: string[];
  allowedContracts: string[];
  allowedSelectors: string[];

  maxPositionBps: number; // cap on a single position, as bps of budget
  maxTokenExposureBps: number; // cap on aggregate exposure to any one token
  minUsdcReserveAtomic: bigint;

  maxSlippageBps: number;
  maxPriceImpactBps: number;
  maxGasPerActionAtomic: bigint;

  dailyExecutionBudgetAtomic: bigint;
  maxActionsPerDay: number;
  cooldownSeconds: number;

  maxQuoteAgeSeconds: number;
  maxDataAgeSeconds: number;

  approvalMode: ApprovalMode;
  allowNewPoolEntry: boolean;
  allowRangeChange: boolean;
  allowFeeCollection: boolean;
  allowExitSwap: boolean;

  pauseState: PauseState;
  userApprovalDigest: string;
}

/** Atomic-money fields become decimal strings for storage / hashing. */
export type SerializedPolicy = Omit<
  Policy,
  | 'capitalBudgetUsdcAtomic'
  | 'minUsdcReserveAtomic'
  | 'maxGasPerActionAtomic'
  | 'dailyExecutionBudgetAtomic'
> & {
  capitalBudgetUsdc: string;
  minUsdcReserve: string;
  maxGasPerAction: string;
  dailyExecutionBudget: string;
};

/**
 * A concrete action a strategy proposes. `checkAction` validates it against the
 * compiled permission set before it is ever shown for signature.
 */
export interface ProposedAction {
  type: ActionType;
  pool: string;
  contract: string;
  selector: string;
  tokensTouched: string[];
  /** Position notional for ENTER (atomic USDC); 0n for pure COLLECT. */
  notionalAtomic: bigint;
  slippageBps: number;
  priceImpactBps: number;
  gasAtomic: bigint;
  quoteAgeSeconds: number;
  dataAgeSeconds: number;
}

export interface Violation {
  code: string;
  message: string;
}

export interface Result {
  ok: boolean;
  violations: Violation[];
}
