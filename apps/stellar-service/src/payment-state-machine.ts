import logger from './logger.js';

export enum PaymentState {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK',
}

export interface PaymentStateContext {
  paymentId: string;
  state: PaymentState;
  transactionHash?: string;
  amount: string;
  fromPublicKey: string;
  toPublicKey: string;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type StateTransition = {
  from: PaymentState;
  to: PaymentState;
  validate?: (context: PaymentStateContext) => boolean;
};

class PaymentStateMachine {
  private validTransitions: StateTransition[] = [
    { from: PaymentState.PENDING, to: PaymentState.SUBMITTED },
    { from: PaymentState.SUBMITTED, to: PaymentState.CONFIRMED },
    { from: PaymentState.SUBMITTED, to: PaymentState.FAILED },
    { from: PaymentState.PENDING, to: PaymentState.FAILED },
    { from: PaymentState.FAILED, to: PaymentState.ROLLED_BACK },
    { from: PaymentState.SUBMITTED, to: PaymentState.ROLLED_BACK },
  ];

  private stateHistory: Map<string, PaymentStateContext[]> = new Map();

  /**
   * Check if a state transition is valid
   */
  isValidTransition(from: PaymentState, to: PaymentState): boolean {
    return this.validTransitions.some((t) => t.from === from && t.to === to);
  }

  /**
   * Transition payment to a new state with validation
   */
  async transition(
    context: PaymentStateContext,
    newState: PaymentState
  ): Promise<PaymentStateContext> {
    const { state: currentState, paymentId } = context;

    if (!this.isValidTransition(currentState, newState)) {
      const error = `Invalid state transition from ${currentState} to ${newState}`;
      logger.error({ paymentId, currentState, newState, error }, 'Invalid state transition');
      throw new Error(error);
    }

    const transitionRule = this.validTransitions.find(
      (t) => t.from === currentState && t.to === newState
    );

    if (transitionRule?.validate && !transitionRule.validate(context)) {
      const error = `Validation failed for transition from ${currentState} to ${newState}`;
      logger.error(
        { paymentId, currentState, newState, error },
        'State transition validation failed'
      );
      throw new Error(error);
    }

    const updatedContext: PaymentStateContext = {
      ...context,
      state: newState,
      updatedAt: new Date(),
    };

    this.recordStateChange(paymentId, updatedContext);

    logger.info(
      { paymentId, from: currentState, to: newState, amount: context.amount },
      `Payment state transitioned from ${currentState} to ${newState}`
    );

    return updatedContext;
  }

  /**
   * Record state change in history
   */
  private recordStateChange(paymentId: string, context: PaymentStateContext): void {
    if (!this.stateHistory.has(paymentId)) {
      this.stateHistory.set(paymentId, []);
    }
    this.stateHistory.get(paymentId)!.push(context);
  }

  /**
   * Get state history for a payment
   */
  getStateHistory(paymentId: string): PaymentStateContext[] {
    return this.stateHistory.get(paymentId) || [];
  }

  /**
   * Rollback a failed payment with validation
   */
  async rollback(context: PaymentStateContext, reason: string): Promise<PaymentStateContext> {
    if (context.state !== PaymentState.FAILED && context.state !== PaymentState.SUBMITTED) {
      throw new Error(
        `Cannot rollback payment in state ${context.state}. Only FAILED or SUBMITTED payments can be rolled back.`
      );
    }

    const rolledBackContext: PaymentStateContext = {
      ...context,
      state: PaymentState.ROLLED_BACK,
      error: reason,
      updatedAt: new Date(),
    };

    this.recordStateChange(context.paymentId, rolledBackContext);

    logger.info(
      { paymentId: context.paymentId, reason, amount: context.amount },
      'Payment rolled back'
    );

    return rolledBackContext;
  }

  /**
   * Get current state of payment
   */
  getCurrentState(context: PaymentStateContext): PaymentState {
    return context.state;
  }

  /**
   * Check if payment is in final state
   */
  isInFinalState(state: PaymentState): boolean {
    return [PaymentState.CONFIRMED, PaymentState.FAILED, PaymentState.ROLLED_BACK].includes(state);
  }

  /**
   * Check if payment is still in progress
   */
  isInProgress(state: PaymentState): boolean {
    return [PaymentState.PENDING, PaymentState.SUBMITTED].includes(state);
  }
}

export const paymentStateMachine = new PaymentStateMachine();
