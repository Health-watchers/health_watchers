/**
 * Loan Status State Machine
 *
 * Valid transitions:
 *   pending → active
 *   pending → cancelled
 *   active  → repaid
 *   active  → liquidated
 *   active  → defaulted
 *
 * All other transitions throw InvalidTransitionError.
 * Every transition is recorded in a history log for audit purposes.
 */

export type LoanStatus = 'pending' | 'active' | 'repaid' | 'liquidated' | 'defaulted' | 'cancelled';

export interface TransitionRecord {
  from: LoanStatus;
  to: LoanStatus;
  at: Date;
  reason?: string;
}

export class InvalidTransitionError extends Error {
  readonly from: LoanStatus;
  readonly to: LoanStatus;

  constructor(from: LoanStatus, to: LoanStatus) {
    super(`Invalid loan status transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

// Adjacency map of valid transitions
const VALID_TRANSITIONS: Record<LoanStatus, ReadonlySet<LoanStatus>> = {
  pending:    new Set<LoanStatus>(['active', 'cancelled']),
  active:     new Set<LoanStatus>(['repaid', 'liquidated', 'defaulted']),
  repaid:     new Set<LoanStatus>(),
  liquidated: new Set<LoanStatus>(),
  defaulted:  new Set<LoanStatus>(),
  cancelled:  new Set<LoanStatus>(),
};

export class LoanStateMachine {
  private _status: LoanStatus;
  private _history: TransitionRecord[];

  constructor(initialStatus: LoanStatus = 'pending') {
    this._status = initialStatus;
    this._history = [];
  }

  get status(): LoanStatus {
    return this._status;
  }

  /** Full transition history for audit purposes */
  get history(): ReadonlyArray<TransitionRecord> {
    return this._history;
  }

  /**
   * Transition to a new status.
   * @throws {InvalidTransitionError} if the transition is not allowed.
   */
  transition(to: LoanStatus, reason?: string): void {
    if (!VALID_TRANSITIONS[this._status].has(to)) {
      throw new InvalidTransitionError(this._status, to);
    }
    this._history.push({ from: this._status, to, at: new Date(), reason });
    this._status = to;
  }

  /** Convenience: is the loan in a terminal state? */
  isTerminal(): boolean {
    return VALID_TRANSITIONS[this._status].size === 0;
  }

  /** Restore a machine from persisted history (e.g. from DB) */
  static fromHistory(history: TransitionRecord[]): LoanStateMachine {
    const machine = new LoanStateMachine('pending');
    for (const record of history) {
      if (!VALID_TRANSITIONS[record.from].has(record.to)) {
        throw new InvalidTransitionError(record.from, record.to);
      }
      machine._history.push(record);
      machine._status = record.to;
    }
    return machine;
  }
}

/** Check whether a transition is valid without throwing */
export function isValidTransition(from: LoanStatus, to: LoanStatus): boolean {
  return VALID_TRANSITIONS[from].has(to);
}
