import { getIdleState } from '../idleTimeout';

const MIN = 60_000;

describe('getIdleState', () => {
  const timeout = 15 * MIN;
  const warning = 60_000;
  const start = 1_000_000;

  it('is active before the warning window', () => {
    expect(getIdleState(start + 10 * MIN, start, timeout, warning)).toEqual({
      phase: 'active',
      secondsLeft: 300,
    });
  });

  it('enters the warning phase 60s before logoff', () => {
    expect(getIdleState(start + 14 * MIN, start, timeout, warning)).toEqual({
      phase: 'warning',
      secondsLeft: 60,
    });
    expect(getIdleState(start + timeout - 1_500, start, timeout, warning).secondsLeft).toBe(2);
  });

  it('expires once the timeout elapses', () => {
    expect(getIdleState(start + timeout, start, timeout, warning)).toEqual({
      phase: 'expired',
      secondsLeft: 0,
    });
  });
});
