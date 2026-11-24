import { test, expect, Page } from '@playwright/test';

const DISPUTES_URL = '/disputes';

interface DisputeFixture {
  id: string;
  contractId: string;
  amount: string;
  reason: string;
  status: 'open' | 'under_review' | 'resolved' | 'rejected';
  createdAt: string;
}

const sampleDisputes: DisputeFixture[] = [
  {
    id: 'DSP-1001',
    contractId: 'CTR-2001',
    amount: '1500.00',
    reason: 'Work not delivered as specified',
    status: 'open',
    createdAt: '2024-01-10T10:00:00.000Z',
  },
  {
    id: 'DSP-1002',
    contractId: 'CTR-2002',
    amount: '750.50',
    reason: 'Late delivery penalty',
    status: 'under_review',
    createdAt: '2024-02-15T12:30:00.000Z',
  },
  {
    id: 'DSP-1003',
    contractId: 'CTR-2003',
    amount: '3200.00',
    reason: 'Quality issues with deliverables',
    status: 'resolved',
    createdAt: '2024-03-20T09:15:00.000Z',
  },
];

async function mockDisputesApi(page: Page) {
  const disputes = [...sampleDisputes];

  await page.route('**/api/disputes**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());

    if (method === 'GET') {
      const status = url.searchParams.get('status');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');

      let filtered = disputes;
      if (status && status !== 'all') {
        filtered = filtered.filter((d) => d.status === status);
      }
      if (from) {
        filtered = filtered.filter((d) => new Date(d.createdAt) >= new Date(from));
      }
      if (to) {
        filtered = filtered.filter((d) => new Date(d.createdAt) <= new Date(to));
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: filtered, total: filtered.length }),
      });
      return;
    }

    if (method === 'POST') {
      const body = request.postDataJSON() as Partial<DisputeFixture>;
      const created: DisputeFixture = {
        id: `DSP-${1000 + disputes.length + 1}`,
        contractId: body.contractId ?? 'CTR-0000',
        amount: body.amount ?? '0.00',
        reason: body.reason ?? '',
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      disputes.push(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/disputes/*/resolve', async (route) => {
    const body = route.request().postDataJSON() as { action: string; counterAmount?: string };
    const url = route.request().url();
    const id = url.split('/disputes/')[1]?.split('/')[0];
    const dispute = disputes.find((d) => d.id === id);
    if (dispute) {
      if (body.action === 'accept') {
        dispute.status = 'resolved';
      } else if (body.action === 'reject') {
        dispute.status = 'rejected';
      } else if (body.action === 'counter') {
        dispute.status = 'under_review';
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dispute ?? {}),
    });
  });

  await page.route('**/api/disputes/export**', async (route) => {
    const format = new URL(route.request().url()).searchParams.get('format') ?? 'csv';
    if (format === 'pdf') {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: Buffer.from('%PDF-1.4 mock pdf content'),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'id,contractId,amount,reason,status,createdAt\nDSP-1001,CTR-2001,1500.00,Work not delivered,open,2024-01-10\n',
      });
    }
  });
}

test.describe('Disputes management lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await mockDisputesApi(page);
    await page.goto(DISPUTES_URL);
  });

  test('files a new dispute and sees it in the list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /disputes/i })).toBeVisible();

    await page.getByRole('button', { name: /file (a )?dispute/i }).click();

    const form = page.getByTestId('dispute-filing-form');
    await expect(form).toBeVisible();

    await form.getByLabel(/contract id/i).fill('CTR-9999');
    await form.getByLabel(/amount/i).fill('2500.00');
    await form.getByLabel(/reason/i).fill('Deliverables were incomplete');
    await form.getByRole('button', { name: /submit|file dispute/i }).click();

    await expect(page.getByText('CTR-9999')).toBeVisible();
    await expect(page.getByText('Deliverables were incomplete')).toBeVisible();
  });

  test('filters disputes by status', async ({ page }) => {
    await expect(page.getByText('DSP-1001')).toBeVisible();
    await expect(page.getByText('DSP-1003')).toBeVisible();

    await page.getByLabel(/status/i).selectOption('resolved');

    await expect(page.getByText('DSP-1003')).toBeVisible();
    await expect(page.getByText('DSP-1001')).not.toBeVisible();
  });

  test('filters disputes by date range', async ({ page }) => {
    await page.getByLabel(/from date/i).fill('2024-02-01');
    await page.getByLabel(/to date/i).fill('2024-03-31');
    await page.getByRole('button', { name: /apply|filter/i }).click();

    await expect(page.getByText('DSP-1002')).toBeVisible();
    await expect(page.getByText('DSP-1003')).toBeVisible();
    await expect(page.getByText('DSP-1001')).not.toBeVisible();
  });

  test('shows dispute timeline and attachments', async ({ page }) => {
    await page.getByText('DSP-1001').click();

    await expect(page.getByTestId('dispute-timeline')).toBeVisible();
    await expect(page.getByTestId('dispute-attachments')).toBeVisible();
  });

  test('accepts a dispute resolution', async ({ page }) => {
    await page.getByText('DSP-1001').click();
    await page.getByRole('button', { name: /^accept$/i }).click();

    await expect(page.getByText(/resolved/i)).toBeVisible();
  });

  test('rejects a dispute resolution', async ({ page }) => {
    await page.getByText('DSP-1001').click();
    await page.getByRole('button', { name: /^reject$/i }).click();

    await expect(page.getByText(/rejected/i)).toBeVisible();
  });

  test('sends a counter-offer', async ({ page }) => {
    await page.getByText('DSP-1001').click();
    await page.getByRole('button', { name: /counter[- ]?offer/i }).click();

    const counterInput = page.getByLabel(/counter amount/i);
    await expect(counterInput).toBeVisible();
    await counterInput.fill('1200.00');
    await page.getByRole('button', { name: /submit counter/i }).click();

    await expect(page.getByText(/under review/i)).toBeVisible();
  });

  test('exports disputes to CSV', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export/i }).click();
    await page.getByRole('menuitem', { name: /csv/i }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('exports disputes to PDF', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export/i }).click();
    await page.getByRole('menuitem', { name: /pdf/i }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});