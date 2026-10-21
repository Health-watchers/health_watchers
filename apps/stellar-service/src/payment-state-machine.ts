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
 *  PENDING              – payment created, not yet submitted to Stellar
 *  AWAITING_SIGNATURES  – multi-sig payment collecting signatures from co-signers
 *  SUBMITTED            – transaction submitted to Horizon, awaiting ledger confirmation
 *  CONFIRMED            – transaction included in a ledger (terminal success)
 *  FAILED               – transaction rejected or timed out (terminal failure)
 *  EXPIRED              – multi-sig payment voided after failing to gather signatures in time (terminal)
 *  ROLLED_BACK          – a previously failed/submitted payment has been reversed (terminal)
 */
export enum PaymentState {
  PENDING = 'PENDING',
  AWAITING_SIGNATURES = 'AWAITING_SIGNATURES',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  ROLLED_BACK = 'ROLLED_BACK',
}

/** Default window (ms) within which a multi-sig payment must gather signatures. */
export const MULTISIG_SIGNATURE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

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
  /** Multi-sig configuration (present for multi-sig payments) */
  multiSig?: MultiSigContext;
}

/**
 * Multi-signature configuration and progress for a payment.
 */
export interface MultiSigContext {
  /** Public keys of all required signers */
  signers: string[];
  /** Number of signatures required to submit (threshold) */
  threshold: number;
  /** Public keys that have signed so far (deduplicated) */
  signatures: string[];
  /** ISO timestamp after which the payment is auto-voided */
  expiresAt: Date;
  /** Base64-encoded envelope XDR awaiting signatures (once built) */
  envelopeXdr?: string;
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
    // Multi-sig paths
    {
      from: PaymentState.PENDING,
      to: PaymentState.AWAITING_SIGNATURES,
      validate: (ctx) => {
        const ms = ctx.multiSig;
        if (!ms) {
          return 'Multi-sig context is required to enter AWAITING_SIGNATURES';
        }
        if (!Array.isArray(ms.signers) || ms.signers.length === 0) {
          return 'At least one signer is required for a multi-sig payment';
        }
        if (!Number.isInteger(ms.threshold) || ms.threshold <= 0) {
          return 'Multi-sig threshold must be a positive integer';
        }
        if (ms.threshold > ms.signers.length) {
          return `Multi-sig threshold (${ms.threshold}) cannot exceed the number of signers (${ms.signers.length})`;
        }
        if (!(ms.expiresAt instanceof Date) || Number.isNaN(ms.expiresAt.getTime())) {
          return 'A valid expiresAt timestamp is required for a multi-sig payment';
        }
        return true;
      },
    },
    {
      from: PaymentState.AWAITING_SIGNATURES,
      to: PaymentState.SUBMITTED,
      validate: (ctx) => {
        const ms = ctx.multiSig;
        if (!ms) {
          return 'Multi-sig context is missing';
        }
        if (this.isMultiSigExpired(ctx)) {
          return 'Multi-sig payment has expired and can no longer be submitted';
        }
        const collected = this.countValidSignatures(ctx);
        if (collected < ms.threshold) {
          return `Insufficient signatures: ${collected}/${ms.threshold} collected`;
        }
        return true;
      },
    },
    {
      from: PaymentState.AWAITING_SIGNATURES,
      to: PaymentState.CONFIRMED,
      validate: (ctx) => {
        const ms = ctx.multiSig;
        if (!ms) {
          return 'Multi-sig context is missing';
        }
        if (this.isMultiSigExpired(ctx)) {
          return 'Multi-sig payment has expired and can no longer be confirmed';
        }
        const collected = this.countValidSignatures(ctx);
        if (collected < ms.threshold) {
          return `Insufficient signatures: ${collected}/${ms.threshold} collected`;
        }
        if (!ctx.transactionHash) {
          return 'A transactionHash must be set before a multi-sig payment can be CONFIRMED';
        }
        return true;
      },
    },
    {
      from: PaymentState.AWAITING_SIGNATURES,
      to: PaymentState.EXPIRED,
      validate: (ctx) => {
        if (!this.isMultiSigExpired(ctx)) {
          return 'Multi-sig payment can only expire after its expiresAt timestamp has passed';
        }
        return true;
      },
    },
    // Failure paths
    { from: PaymentState.SUBMITTED, to: PaymentState.FAILED },
    { from: PaymentState.PENDING, to: PaymentState.FAILED },
    { from: PaymentState.AWAITING_SIGNATURES, to: PaymentState.FAILED },
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
    patch?: Partial<
      Pick<PaymentStateContext, 'transactionHash' | 'error' | 'metadata' | 'multiSig'>
    >
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

  // ── Multi-sig helpers ──────────────────────────────────────────────────

  /**
   * Returns true when the multi-sig payment's signature window has elapsed.
   */
  isMultiSigExpired(context: PaymentStateContext, now: Date = new Date()): boolean {
    const ms = context.multiSig;
    if (!ms || !(ms.expiresAt instanceof Date)) {
      return false;
    }
    return now.getTime() >= ms.expiresAt.getTime();
  }

  /**
   * Count signatures that belong to the configured signer set (deduplicated).
   */
  countValidSignatures(context: PaymentStateContext): number {
    const ms = context.multiSig;
    if (!ms) {
      return 0;
    }
    const signerSet = new Set(ms.signers);
    const unique = new Set(ms.signatures.filter((s) => signerSet.has(s)));
    return unique.size;
  }

  /**
   * Record a signature from a signer. Returns the updated context.
   *
   * Throws if the payment is not awaiting signatures, the signer is not in
   * the configured signer set, the payment has expired, or the signer has
   * already signed.
   */
  async addSignature(context: PaymentStateContext, signer: string): Promise<PaymentStateContext> {
    const ms = context.multiSig;
    if (context.state !== PaymentState.AWAITING_SIGNATURES || !ms) {
      throw new Error(
        `Cannot add a signature to a payment in state ${context.state}; expected AWAITING_SIGNATURES`
      );
    }
    if (!ms.signers.includes(signer)) {
      throw new Error(`Signer ${signer} is not authorized for payment ${context.paymentId}`);
    }
    if (this.isMultiSigExpired(context)) {
      throw new Error(`Multi-sig payment ${context.paymentId} has expired`);
    }
    if (ms.signatures.includes(signer)) {
      throw new Error(`Signer ${signer} has already signed payment ${context.paymentId}`);
    }

    const updatedContext: PaymentStateContext = {
      ...context,
      multiSig: { ...ms, signatures: [...ms.signatures, signer] },
      updatedAt: new Date(),
    };

    this.recordStateChange(context.paymentId, updatedContext);

    logger.info(
      {
        paymentId: context.paymentId,
        signer,
        collected: this.countValidSignatures(updatedContext),
        threshold: ms.threshold,
      },
      'Multi-sig signature recorded'
    );

    return updatedContext;
  }

  /**
   * Returns true when enough valid signatures have been collected.
   */
  hasReachedThreshold(context: PaymentStateContext): boolean {
    const ms = context.multiSig;
    if (!ms) {
      return false;
    }
    return this.countValidSignatures(context) >= ms.threshold;
  }

  /**
   * Auto-void a multi-sig payment whose signature window has elapsed.
   *
   * Returns the updated context in EXPIRED state, or the unchanged context
   * if the payment is not awaiting signatures or has not yet expired.
   */
  async expireIfTimedOut(
    context: PaymentStateContext,
    now: Date = new Date()
  ): Promise<PaymentStateContext> {
    if (context.state !== PaymentState.AWAITING_SIGNATURES) {
      return context;
    }
    if (!this.isMultiSigExpired(context, now)) {
      return context;
    }
    return this.transition(context, PaymentState.EXPIRED, {
      error: 'Multi-sig payment voided: signature threshold not reached within 24 hours',
    });
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
    return [
      PaymentState.CONFIRMED,
      PaymentState.FAILED,
      PaymentState.EXPIRED,
      PaymentState.ROLLED_BACK,
    ].includes(state);
  }

  /**
   * Returns true for in-progress states: PENDING, AWAITING_SIGNATURES, SUBMITTED.
   */
  isInProgress(state: PaymentState): boolean {
    return [PaymentState.PENDING, PaymentState.AWAITING_SIGNATURES, PaymentState.SUBMITTED].includes(
      state
    );
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
    multiSig?: {
      signers: string[];
      threshold: number;
      expiresAt?: Date;
    };
  }): PaymentStateContext {
    const now = new Date();
    const multiSig: MultiSigContext | undefined = params.multiSig
      ? {
          signers: [...params.multiSig.signers],
          threshold: params.multiSig.threshold,
          signatures: [],
          expiresAt:
            params.multiSig.expiresAt ?? new Date(now.getTime() + MULTISIG_SIGNATURE_TIMEOUT_MS),
        }
      : undefined;

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
      multiSig,
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

// Re-export the class for testing (allows isolated instances).
export { PaymentStateMachine };
