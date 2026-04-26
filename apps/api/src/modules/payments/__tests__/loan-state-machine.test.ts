import {
  LoanStateMachine,
  InvalidTransitionError,
  isValidTransition,
  LoanStatus,
} from '../loan-state-machine';

describe('LoanStateMachine', () => {
  describe('initial state', () => {
    it('defaults to pending', () => {
      expect(new LoanStateMachine().status).toBe('pending');
    });

    it('accepts a custom initial status', () => {
      expect(new LoanStateMachine('active').status).toBe('active');
    });
  });

  describe('valid transitions', () => {
    it('pending → active', () => {
      const m = new LoanStateMachine();
      m.transition('active');
      expect(m.status).toBe('active');
    });

    it('pending → cancelled', () => {
      const m = new LoanStateMachine();
      m.transition('cancelled');
      expect(m.status).toBe('cancelled');
    });

    it('active → repaid', () => {
      const m = new LoanStateMachine('active');
      m.transition('repaid');
      expect(m.status).toBe('repaid');
    });

    it('active → liquidated', () => {
      const m = new LoanStateMachine('active');
      m.transition('liquidated');
      expect(m.status).toBe('liquidated');
    });

    it('active → defaulted', () => {
      const m = new LoanStateMachine('active');
      m.transition('defaulted');
      expect(m.status).toBe('defaulted');
    });
  });

  describe('invalid transitions throw InvalidTransitionError', () => {
    const invalidCases: [LoanStatus, LoanStatus][] = [
      ['pending', 'repaid'],
      ['pending', 'liquidated'],
      ['pending', 'defaulted'],
      ['active', 'pending'],
      ['active', 'cancelled'],
      ['repaid', 'active'],
      ['repaid', 'pending'],
      ['liquidated', 'active'],
      ['defaulted', 'active'],
      ['cancelled', 'active'],
    ];

    it.each(invalidCases)('%s → %s throws InvalidTransitionError', (from, to) => {
      const m = new LoanStateMachine(from);
      expect(() => m.transition(to)).toThrow(InvalidTransitionError);
    });

    it('error carries from/to properties', () => {
      const m = new LoanStateMachine('pending');
      try {
        m.transition('repaid');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidTransitionError);
        expect((err as InvalidTransitionError).from).toBe('pending');
        expect((err as InvalidTransitionError).to).toBe('repaid');
      }
    });
  });

  describe('transition history', () => {
    it('records each transition', () => {
      const m = new LoanStateMachine();
      m.transition('active', 'loan approved');
      m.transition('repaid', 'full repayment received');
      expect(m.history).toHaveLength(2);
      expect(m.history[0]).toMatchObject({ from: 'pending', to: 'active', reason: 'loan approved' });
      expect(m.history[1]).toMatchObject({ from: 'active', to: 'repaid', reason: 'full repayment received' });
    });

    it('history is immutable (readonly array)', () => {
      const m = new LoanStateMachine();
      m.transition('active');
      const history = m.history;
      // TypeScript prevents push at compile time; verify it's a copy at runtime
      expect(() => (history as any).push({})).toThrow();
    });
  });

  describe('terminal states', () => {
    it.each(['repaid', 'liquidated', 'defaulted', 'cancelled'] as LoanStatus[])(
      '%s is terminal',
      (status) => {
        expect(new LoanStateMachine(status).isTerminal()).toBe(true);
      }
    );

    it.each(['pending', 'active'] as LoanStatus[])('%s is not terminal', (status) => {
      expect(new LoanStateMachine(status).isTerminal()).toBe(false);
    });
  });

  describe('fromHistory', () => {
    it('restores state from history', () => {
      const now = new Date();
      const m = LoanStateMachine.fromHistory([
        { from: 'pending', to: 'active', at: now },
        { from: 'active', to: 'repaid', at: now },
      ]);
      expect(m.status).toBe('repaid');
      expect(m.history).toHaveLength(2);
    });

    it('throws on invalid history entry', () => {
      expect(() =>
        LoanStateMachine.fromHistory([{ from: 'pending', to: 'repaid', at: new Date() }])
      ).toThrow(InvalidTransitionError);
    });
  });
});

describe('isValidTransition', () => {
  it('returns true for valid transitions', () => {
    expect(isValidTransition('pending', 'active')).toBe(true);
    expect(isValidTransition('active', 'repaid')).toBe(true);
  });

  it('returns false for invalid transitions', () => {
    expect(isValidTransition('pending', 'repaid')).toBe(false);
    expect(isValidTransition('repaid', 'active')).toBe(false);
  });
});
