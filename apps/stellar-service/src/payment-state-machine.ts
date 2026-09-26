/**
 * payment-state-machine.ts
 *
 * Issue #995 — [Stellar] Payment State Machine
 *
 * Implements a strict state machine for the full payment lifecycle:
 *   - Well-defined states: PENDING → SUBMITTED → CONFIRMED | FAILED → ROLLED_BACK
 *   - Validated state transitions (only legal moves are allowed)
 *   - Per-transition validation hooks
 *   - State history tracking per payment
 *   - Rollback support with mandatory reason capture
 */

import logger from './logger.js';

// ── States ─────────────────────────────────────────────────────────────────

/**
 * Exhaustive set of payment lifecycle states.
 *
 *  PENDING      – payment created, not yet submitted to Stellar
 *  SUBMITTED    – transaction submitted to Horizon, awaiting ledger confirmation
 *  CONFIRMED    – transaction included in a ledger (terminal success)
 *  FAILED       – transaction rejected or timed out (terminal failure)
 *  ROLLED_BACK  – a previously failed/submitted payment has been reversed (terminal)
 */
export enum PaymentState {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK',
}

// ── Context ────────────────────────────────────────────────────────────────

export interface PaymentStateContext {
  /** Unique identifier for this payment */
  paymentId: string;
  /** Current state */
  state: PaymentState;
  /** Stellar transaction hash (available once SUBMITTED or later) */
  transactionHash?: string;
  /** Amount in XLM (or asset units) as a decimal string */
  amount: string;
  /** Source account public key */
  fromPublicKey: string;
  /** Destination account public key */
  toPublicKey: string;
  /** ISO timestamp when the payment was first created */
  createdAt: Date;
  /** ISO timestamp of the last state change */
  updatedAt: Date;
  /** Human-readable error description (FAILED / ROLLED_BACK states) */
  error?: string;
  /** Arbitrary key/value metadata */
  metadata?: Record<string, unknown>;
  /** Number of state transitions that have occurred */
  transitionCount: number;
}

// ── Transition definitions ─────────────────────────────────────────────────

export interface StateTransition {
  from: PaymentState;
  to: PaymentState;
  /**
   * Optional guard that must return true for the transition to proceed.
   * Throw or return false to block the transition with a validation error.
   */
  validate?: (context: PaymentStateContext) => boolean | string;
}

export interface TransitionError {
  paymentId: string;
  from: PaymentState;
  to: PaymentState;
  reason: string;
}

// ── PaymentStateMachine ────────────────────────────────────────────────────

class PaymentStateMachine {
  /**
   * All allowed state transitions.
   * Any transition not listed here is illegal and will be rejected.
   */
  private readonly validTransitions: StateTransition[] = [
    // Normal happy path
    {
      from: PaymentState.PENDING,
      to: PaymentState.SUBMITTED,
      validate: (ctx) => {
        if (!ctx.fromPublicKey || !ctx.toPublicKey) {
          return 'Both fromPublicKey and toPublicKey are required before submission';
        }
        const amount = parseFloat(ctx.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return 'Amount must be a positive finite number before submission';
        }
        return true;
      },
    },
    {
      from: PaymentState.SUBMITTED,
      to: PaymentState.CONFIRMED,
      validate: (ctx) => {
        if (!ctx.transactionHash) {
          return 'A transactionHash must be set before a SUBMITTED payment can be CONFIRMED';
        }
        return true;
      },
    },
    // Failure paths
    { from: PaymentState.SUBMITTED, to: PaymentState.FAILED },
    { from: PaymentState.PENDING, to: PaymentState.FAILED },
    // Rollback paths
    { from: PaymentState.FAILED, to: PaymentState.ROLLED_BACK },
    { from: PaymentState.SUBMITTED, to: PaymentState.ROLLED_BACK },
  ];

  /**
   * Full state-change history, keyed by paymentId.
   * Each entry records the context *after* the transition.
   */
  private readonly stateHistory: Map<string, PaymentStateContext[]> = new Map();

  // ── Transition validation ──────────────────────────────────────────────

  /**
   * Check whether a transition from → to is listed in the allowed set.
   */
  isValidTransition(from: PaymentState, to: PaymentState): boolean {
    return this.validTransitions.some((t) => t.from === from && t.to === to);
  }

  /**
   * Return all states reachable from the given state in a single step.
   */
  getReachableStates(from: PaymentState): PaymentState[] {
    return this.validTransitions.filter((t) => t.from === from).map((t) => t.to);
  }

  // ── State transition ───────────────────────────────────────────────────

  /**
   * Transition a payment to a new state.
   *
   * Steps:
   *  1. Reject illegal transitions
   *  2. Run the per-transition guard (if any)
   *  3. Build updated context
   *  4. Record in history
   *  5. Return the updated context
   *
   * Throws a TransitionError-shaped Error on any violation.
   */
  async transition(
    context: PaymentStateContext,
    newState: PaymentState,
    patch?: Partial<Pick<PaymentStateContext, 'transactionHash' | 'error' | 'metadata'>>
  ): Promise<PaymentStateContext> {
    const { state: currentState, paymentId } = context;

    // 1. Guard: is this transition allowed at all?
    if (!this.isValidTransition(currentState, newState)) {
      const reason = `Invalid transition ${currentState} → ${newState}. Allowed from ${currentState}: [${this.getReachableStates(currentState).join(', ') || 'none (terminal state)'}]`;
      logger.error({ paymentId, currentState, newState }, reason);
      throw Object.assign(new Error(reason), {
        paymentId,
        from: currentState,
        to: newState,
      } as TransitionError);
    }

    // 2. Guard: run the per-transition validator
    const rule = this.validTransitions.find((t) => t.from === currentState && t.to === newState)!;
    if (rule.validate) {
      const validationResult = rule.validate({ ...context, ...patch });
      if (validationResult !== true) {
        const reason =
          typeof validationResult === 'string'
            ? validationResult
            : `Validation failed for transition ${currentState} → ${newState}`;
        logger.error(
          { paymentId, currentState, newState, reason },
          'State transition validation failed'
        );
        throw Object.assign(new Error(reason), {
          paymentId,
          from: currentState,
          to: newState,
        } as TransitionError);
      }
    }

    // 3. Build updated context
    const updatedContext: PaymentStateContext = {
      ...context,
      ...patch,
      state: newState,
      updatedAt: new Date(),
      transitionCount: context.transitionCount + 1,
    };

    // 4. Record history
    this.recordStateChange(paymentId, updatedContext);

    logger.info(
      {
        paymentId,
        from: currentState,
        to: newState,
        amount: context.amount,
        transitionCount: updatedContext.transitionCount,
      },
      `Payment state: ${currentState} → ${newState}`
    );

    return updatedContext;
  }

  // ── Rollback ───────────────────────────────────────────────────────────

  /**
   * Roll back a payment that is in FAILED or SUBMITTED state.
   *
   * A rollback records the mandatory reason and moves the payment to
   * ROLLED_BACK without going through the normal transition table so that
   * the reason is always captured.
   *
   * Note: for an SUBMITTED payment, callers should ensure no confirmation
   * arrives after the rollback (the caller is responsible for coordinating
   * with the Stellar network).
   */
  async rollback(context: PaymentStateContext, reason: string): Promise<PaymentStateContext> {
    const { state, paymentId } = context;

    if (state !== PaymentState.FAILED && state !== PaymentState.SUBMITTED) {
      throw new Error(
        `Cannot rollback a payment in state ${state}. Only FAILED or SUBMITTED payments can be rolled back.`
      );
    }

    if (!reason || !reason.trim()) {
      throw new Error('A non-empty rollback reason is required');
    }

    const rolledBack: PaymentStateContext = {
      ...context,
      state: PaymentState.ROLLED_BACK,
      error: reason.trim(),
      updatedAt: new Date(),
      transitionCount: context.transitionCount + 1,
    };

    this.recordStateChange(paymentId, rolledBack);

    logger.info(
      { paymentId, previousState: state, reason, amount: context.amount },
      'Payment rolled back'
    );

    return rolledBack;
  }

  // ── History ────────────────────────────────────────────────────────────

  /**
   * Return the full state history for a payment (oldest entry first).
   */
  getStateHistory(paymentId: string): PaymentStateContext[] {
    return this.stateHistory.get(paymentId) ?? [];
  }

  /**
   * Return the most recent state context for a payment.
   */
  getLatestContext(paymentId: string): PaymentStateContext | undefined {
    const history = this.getStateHistory(paymentId);
    return history[history.length - 1];
  }

  /**
   * Clear the history for a payment (e.g. after archiving).
   */
  clearHistory(paymentId: string): void {
    this.confirmHistoryExists(paymentId);
    this.stateHistory.delete(paymentId);
    logger.debug({ paymentId }, 'Payment state history cleared');
  }

  /**
   * Return total number of payments tracked by this machine instance.
   */
  getTrackedPaymentCount(): number {
    return this.stateHistory.size;
  }

  // ── State query helpers ────────────────────────────────────────────────

  /** Return the current state of the provided context. */
  getCurrentState(context: PaymentStateContext): PaymentState {
    return context.state;
  }

  /**
   * Returns true for terminal states: CONFIRMED, FAILED, ROLLED_BACK.
   * No further transitions are possible from a terminal state.
   */
  isInFinalState(state: PaymentState): boolean {
    return [PaymentState.CONFIRMED, PaymentState.FAILED, PaymentState.ROLLED_BACK].includes(state);
  }

  /**
   * Returns true for in-progress states: PENDING, SUBMITTED.
   */
  isInProgress(state: PaymentState): boolean {
    return [PaymentState.PENDING, PaymentState.SUBMITTED].includes(state);
  }

  // ── Factory helper ─────────────────────────────────────────────────────

  /**
   * Create a brand new PaymentStateContext in PENDING state.
   */
  createPayment(params: {
    paymentId: string;
    amount: string;
    fromPublicKey: string;
    toPublicKey: string;
    metadata?: Record<string, unknown>;
  }): PaymentStateContext {
    const now = new Date();
    const context: PaymentStateContext = {
      paymentId: params.paymentId,
      state: PaymentState.PENDING,
      amount: params.amount,
      fromPublicKey: params.fromPublicKey,
      toPublicKey: params.toPublicKey,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata,
      transitionCount: 0,
    };

    this.recordStateChange(params.paymentId, context);

    logger.info(
      {
        paymentId: params.paymentId,
        amount: params.amount,
        from: params.fromPublicKey,
        to: params.toPublicKey,
      },
      'Payment created in PENDING state'
    );

    return context;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private recordStateChange(paymentId: string, context: PaymentStateContext): void {
    if (!this.stateHistory.has(paymentId)) {
      this.stateHistory.set(paymentId, []);
    }
    this.stateHistory.get(paymentId)!.push({ ...context });
  }

  private confirmHistoryExists(paymentId: string): void {
    if (!this.stateHistory.has(paymentId)) {
      throw new Error(`No payment state history found for paymentId: ${paymentId}`);
    }
  }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const paymentStateMachine = new PaymentStateMachine();
