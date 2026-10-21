import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for the real-time dashboard (issue #1609).
 *
 * These tests simulate WebSocket events from the server and assert that the
 * dashboard widgets (StatCard, AppointmentWidget, RecentTable) update live
 * without a page refresh. They also verify the connection status indicator
 * and the graceful polling fallback when the WebSocket is unavailable.
 */

const DASHBOARD_PATH = '/dashboard';

/**
 * Installs a mock WebSocket on the page before any application code runs.
 * The mock records every instance so tests can push server messages into it.
 */
async function installMockWebSocket(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error - augmenting window for test purposes
    window.__mockSockets = [];
    // @ts-expect-error - augmenting window for test purposes
    window.__mockSocketMessages = [];

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      url: string;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        // @ts-expect-error - augmenting window for test purposes
        window.__mockSockets.push(this);
        // Simulate a successful connection on the next tick.
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event('open'));
        }, 0);
      }

      send(data: string) {
        // @ts-expect-error - augmenting window for test purposes
        window.__mockSocketMessages.push(data);
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(new CloseEvent('close'));
      }

      addEventListener(type: string, listener: (ev: Event) => void) {
        if (type === 'open') this.onopen = listener as (ev: Event) => void;
        if (type === 'message') this.onmessage = listener as (ev: MessageEvent) => void;
        if (type === 'close') this.onclose = listener as (ev: CloseEvent) => void;
        if (type === 'error') this.onerror = listener as (ev: Event) => void;
      }

      removeEventListener() {
        /* no-op for mock */
      }
    }

    // @ts-expect-error - override native WebSocket
    window.WebSocket = MockWebSocket;
  });
}

/**
 * Pushes a server message into the most recently created mock socket.
 */
async function emitSocketMessage(page: Page, payload: unknown) {
  await page.evaluate((msg) => {
    // @ts-expect-error - augmenting window for test purposes
    const sockets = window.__mockSockets as Array<{
      onmessage: ((ev: MessageEvent) => void) | null;
    }>;
    const socket = sockets[sockets.length - 1];
    if (!socket || !socket.onmessage) {
      throw new Error('No active mock WebSocket to emit into');
    }
    socket.onmessage(new MessageEvent('message', { data: JSON.stringify(msg) }));
  }, payload);
}

/**
 * Simulates the socket closing (e.g. server restart / network loss).
 */
async function closeMockSocket(page: Page) {
  await page.evaluate(() => {
    // @ts-expect-error - augmenting window for test purposes
    const sockets = window.__mockSockets as Array<{ close: () => void }>;
    const socket = sockets[sockets.length - 1];
    socket?.close();
  });
}

test.describe('Dashboard real-time updates', () => {
  test.beforeEach(async ({ page }) => {
    await installMockWebSocket(page);
  });

  test('shows a connected status indicator once the socket opens', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);

    const indicator = page.getByTestId('realtime-connection-status');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveAttribute('data-status', 'connected');
  });

  test('updates StatCard live on a new patient registration', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);

    const totalPatientsCard = page.getByTestId('stat-card-total-patients');
    await expect(totalPatientsCard).toBeVisible();

    const initialValue = await totalPatientsCard
      .getByTestId('stat-card-value')
      .textContent();
    const initialCount = Number((initialValue ?? '0').replace(/[^0-9]/g, ''));

    await emitSocketMessage(page, {
      type: 'patient.registered',
      room: 'clinic',
      payload: {
        patientId: 'pat_live_1',
        firstName: 'Live',
        lastName: 'Patient',
        registeredAt: new Date().toISOString(),
      },
    });

    await expect
      .poll(async () => {
        const text = await totalPatientsCard
          .getByTestId('stat-card-value')
          .textContent();
        return Number((text ?? '0').replace(/[^0-9]/g, ''));
      })
      .toBeGreaterThan(initialCount);

    // No page refresh should have occurred.
    await expect(page.getByTestId('dashboard-root')).toBeVisible();
  });

  test('updates AppointmentWidget live on an appointment status change', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);

    const widget = page.getByTestId('appointment-widget');
    await expect(widget).toBeVisible();

    await emitSocketMessage(page, {
      type: 'appointment.status_changed',
      room: 'clinic',
      payload: {
        appointmentId: 'apt_live_1',
        status: 'CONFIRMED',
        patientName: 'Live Patient',
        scheduledAt: new Date().toISOString(),
      },
    });

    const row = widget.getByTestId('appointment-row-apt_live_1');
    await expect(row).toBeVisible();
    await expect(row.getByTestId('appointment-status')).toHaveText(/confirmed/i);
  });

  test('updates RecentTable live on a payment confirmation', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);

    const table = page.getByTestId('recent-table');
    await expect(table).toBeVisible();

    await emitSocketMessage(page, {
      type: 'payment.confirmed',
      room: 'clinic',
      payload: {
        paymentId: 'pay_live_1',
        amount: 15000,
        currency: 'USD',
        patientName: 'Live Patient',
        confirmedAt: new Date().toISOString(),
      },
    });

    const row = table.getByTestId('recent-row-pay_live_1');
    await expect(row).toBeVisible();
    await expect(row).toContainText(/150/);
  });

  test('falls back to polling when the WebSocket is unavailable', async ({ page }) => {
    // Override the mock so the socket immediately errors out.
    await page.addInitScript(() => {
      // @ts-expect-error - augmenting window for test purposes
      const sockets = window.__mockSockets as Array<{
        onerror: ((ev: Event) => void) | null;
        onclose: ((ev: CloseEvent) => void) | null;
        readyState: number;
      }>;
      // Patch the constructor to fail immediately on next instantiation.
      const NativeMock = window.WebSocket as unknown as new (url: string) => unknown;
      // @ts-expect-error - override native WebSocket
      window.WebSocket = class extends (NativeMock as unknown as typeof WebSocket) {
        constructor(url: string) {
          super(url);
          setTimeout(() => {
            const socket = sockets[sockets.length - 1];
            if (socket) {
              socket.readyState = 3;
              socket.onerror?.(new Event('error'));
              socket.onclose?.(new CloseEvent('close'));
            }
          }, 0);
        }
      };
    });

    await page.goto(DASHBOARD_PATH);

    const indicator = page.getByTestId('realtime-connection-status');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveAttribute('data-status', /disconnected|polling/);

    // Polling should still keep the dashboard populated.
    const totalPatientsCard = page.getByTestId('stat-card-total-patients');
    await expect(totalPatientsCard).toBeVisible();
    await expect(totalPatientsCard.getByTestId('stat-card-value')).not.toHaveText('');
  });

  test('reflects a dropped connection in the status indicator', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);

    const indicator = page.getByTestId('realtime-connection-status');
    await expect(indicator).toHaveAttribute('data-status', 'connected');

    await closeMockSocket(page);

    await expect(indicator).toHaveAttribute('data-status', /disconnected|reconnecting|polling/);
  });
});