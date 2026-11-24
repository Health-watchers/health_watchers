import { act, fireEvent, render, screen } from '@testing-library/react';
import { SessionTimeoutWarning } from '../SessionTimeoutWarning';
import { useAuth } from '@/context/AuthContext';

jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));

/** In-memory BroadcastChannel so a test can play the role of another tab. */
class FakeBroadcastChannel {
  static channels: FakeBroadcastChannel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: unknown[] = [];
  constructor(public name: string) {
    FakeBroadcastChannel.channels.push(this);
  }
  postMessage(data: unknown) {
    this.sent.push(data);
    FakeBroadcastChannel.channels
      .filter((c) => c !== this && c.name === this.name)
      .forEach((c) => c.onmessage?.({ data }));
  }
  close() {
    FakeBroadcastChannel.channels = FakeBroadcastChannel.channels.filter((c) => c !== this);
  }
}

const logout = jest.fn().mockResolvedValue(undefined);
const SECOND = 1000;
const IDLE_MINUTES = 2;

function signIn() {
  (useAuth as jest.Mock).mockReturnValue({ user: { userId: 'u1' }, logout });
}

async function renderSignedIn() {
  signIn();
  render(<SessionTimeoutWarning />);
  // Let the session-policy fetch resolve
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const thisTab = (): FakeBroadcastChannel => {
  const [channel] = FakeBroadcastChannel.channels;
  if (!channel) throw new Error('SessionTimeoutWarning did not open a BroadcastChannel');
  return channel;
};

beforeEach(() => {
  jest.useFakeTimers();
  FakeBroadcastChannel.channels = [];
  (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = FakeBroadcastChannel;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { idleTimeoutMinutes: IDLE_MINUTES, warningSeconds: 60 } }),
  }) as jest.Mock;
  logout.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SessionTimeoutWarning', () => {
  it('renders nothing and polls nothing when signed out', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null, logout });
    const { container } = render(<SessionTimeoutWarning />);
    act(() => jest.advanceTimersByTime(60 * 60 * SECOND));
    expect(container).toBeEmptyDOMElement();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it("uses the clinic's idle timeout and warns 60s before logoff", async () => {
    await renderSignedIn();
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/session-policy', expect.anything());

    advance(59 * SECOND);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    advance(2 * SECOND);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('59 seconds')).toBeInTheDocument();
  });

  it('"Stay signed in" dismisses the warning and tells the other tabs', async () => {
    await renderSignedIn();
    advance(61 * SECOND);

    fireEvent.click(screen.getByRole('button', { name: /stay signed in/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(thisTab().sent).toContainEqual({ type: 'activity', at: expect.any(Number) });
    advance(61 * SECOND);
    expect(logout).not.toHaveBeenCalled();
  });

  it('ignores ordinary activity once the warning is showing', async () => {
    await renderSignedIn();
    advance(61 * SECOND);

    fireEvent.keyDown(document);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('logs out with reason idle_timeout and signals the other tabs', async () => {
    await renderSignedIn();
    advance(IDLE_MINUTES * 60 * SECOND + SECOND);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledWith({ reason: 'idle_timeout' });
    expect(thisTab().sent).toContainEqual({ type: 'logout' });
  });

  it('stays signed in while another tab is active', async () => {
    await renderSignedIn();
    const otherTab = new FakeBroadcastChannel('hw-session');

    // 90s + 50s is past the 2-minute timeout, but the other tab was active at 90s
    advance(90 * SECOND);
    act(() => otherTab.postMessage({ type: 'activity', at: Date.now() }));
    advance(50 * SECOND);

    expect(logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('logs out when another tab times out', async () => {
    await renderSignedIn();
    const otherTab = new FakeBroadcastChannel('hw-session');

    act(() => otherTab.postMessage({ type: 'logout' }));

    expect(logout).toHaveBeenCalledWith({ reason: 'idle_timeout' });
    // The tab that received the signal does not re-broadcast it
    expect(thisTab().sent).not.toContainEqual({ type: 'logout' });
  });
});
