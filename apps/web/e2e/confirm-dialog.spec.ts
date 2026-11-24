import { test, expect, type Page, type Route } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fulfill a route with JSON — useful for mocking API responses. */
function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** Mock a single pending payment returned by GET /api/v1/payments. */
function mockPaymentsResponse() {
  return {
    status: 'success',
    data: [
      {
        id: 'pay_mock_001',
        intentId: 'intent_mock_001',
        patientId: 'pat_mock_001',
        amount: '50',
        asset: 'XLM',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

/** Mock a single scheduled appointment returned by GET /api/v1/appointments. */
function mockAppointmentsResponse() {
  return {
    status: 'success',
    data: [
      {
        _id: 'appt_mock_001',
        patientId: 'pat_mock_001',
        doctorId: 'doc_mock_001',
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        duration: 30,
        type: 'Office visit',
        status: 'scheduled',
        chiefComplaint: 'Annual checkup',
      },
    ],
  };
}

/** Mock encounters list returned by GET /api/v1/encounters. */
function mockEncountersResponse() {
  return {
    status: 'success',
    data: [
      {
        id: 'enc_mock_001',
        patientId: 'pat_mock_001',
        patient: { firstName: 'John', lastName: 'Doe', systemId: 'SYS-001' },
        chiefComplaint: 'Headache',
        diagnosis: [{ code: 'R51', description: 'Headache' }],
        status: 'open',
        attendingDoctorId: 'doc_mock_001',
        createdAt: new Date().toISOString(),
      },
    ],
    meta: { total: 1, limit: 20 },
  };
}

/** Mock patient detail returned by GET /api/v1/patients/:id. */
function mockPatientResponse() {
  return {
    status: 'success',
    data: {
      _id: 'pat_mock_001',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-01',
      sex: 'male',
      contactNumber: '555-0100',
      address: '123 Main St',
      systemId: 'SYS-001',
      isActive: true,
      gender: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
test.describe('Confirm Dialog blocks accidental destructive actions', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  });

  // ── 1. Delete patient: dialog appears and requires typed name ───────────
  test('delete patient shows confirm dialog with typed-name requirement', async ({ page }) => {
    await page.route('**/api/v1/patients/pat_mock_001', (r) =>
      fulfillJson(r, mockPatientResponse())
    );
    // Mock sub-resources loaded by the detail page
    await page.route('**/api/v1/patients/pat_mock_001/encounters**', (r) =>
      fulfillJson(r, { status: 'success', data: [] })
    );
    await page.route('**/api/v1/patients/pat_mock_001/payments**', (r) =>
      fulfillJson(r, { status: 'success', data: [] })
    );
    await page.route('**/api/v1/patients/pat_mock_001/vitals**', (r) =>
      fulfillJson(r, { status: 'success', data: [] })
    );
    await page.route('**/api/v1/patients/pat_mock_001/analytics**', (r) =>
      fulfillJson(r, { status: 'success', data: [] })
    );
    await page.route('**/api/v1/patients/pat_mock_001/allergies**', (r) =>
      fulfillJson(r, { status: 'success', data: [] })
    );

    await page.goto('/patients/pat_mock_001');
    await expect(page.getByRole('heading', { name: /john doe/i })).toBeVisible({
      timeout: 8_000,
    });

    // Click the "Delete patient" button
    const deleteBtn = page.getByRole('button', { name: /delete patient/i });
    await deleteBtn.click();

    // The confirm dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/permanently delete/i)).toBeVisible();
    await expect(page.getByText(/john doe/i)).toBeVisible();

    // The confirm button should be disabled until the name is typed
    const confirmBtn = page.getByRole('button', { name: /^delete patient$/i });
    await expect(confirmBtn).toBeDisabled();

    // Clicking the disabled confirm button should NOT trigger the delete
    let deleteCalled = false;
    await page.route('**/api/v1/patients/pat_mock_001', (r) => {
      if (r.request().method() === 'DELETE') {
        deleteCalled = true;
        return fulfillJson(r, { status: 'success', data: { id: 'pat_mock_001', isActive: false } });
      }
      return fulfillJson(r, mockPatientResponse());
    });

    await confirmBtn.click({ force: true });
    await page.waitForTimeout(500);
    expect(deleteCalled).toBe(false);

    // Now type the correct name — confirm button becomes enabled
    const input = page.getByRole('textbox');
    await input.fill('John Doe');
    await expect(confirmBtn).toBeEnabled();

    // Closing the dialog via "Cancel" should also NOT trigger delete
    await page.getByRole('button', { name: /cancel/i }).click();
    await page.waitForTimeout(300);
    expect(deleteCalled).toBe(false);
  });

  // ── 2. Void payment: dialog appears and blocks accidental void ────────────
  test('void payment shows confirm dialog and blocks accidental void', async ({ page }) => {
    await page.route('**/api/v1/payments**', (r) => {
      const url = r.request().url();
      // For list endpoint (no :id)
      if (url.endsWith('/payments') || url.includes('/payments?')) {
        return fulfillJson(r, mockPaymentsResponse());
      }
      return r.continue();
    });

    let voidCalled = false;
    await page.route('**/api/v1/payments/pay_mock_001/cancel', (r) => {
      if (r.request().method() === 'PATCH') {
        voidCalled = true;
        return fulfillJson(r, {
          status: 'success',
          data: { id: 'pay_mock_001', status: 'cancelled' },
        });
      }
      return r.continue();
    });

    await page.goto('/payments');
    await expect(page.getByText(/payments/i).first()).toBeVisible({ timeout: 8_000 });

    // Click the "Void" button
    const voidBtn = page.getByRole('button', { name: /void/i });
    await voidBtn.click();

    // The confirm dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/void a pending payment/i)).toBeVisible();

    // Press Escape to close the dialog — should NOT trigger void
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(voidCalled).toBe(false);
  });

  // ── 3. Remove encounter: dialog appears and blocks accidental removal ──
  test('remove encounter shows confirm dialog and blocks accidental removal', async ({ page }) => {
    await page.route('**/api/v1/encounters**', (r) => {
      const url = r.request().url();
      if (url.includes('/encounters?') || url.endsWith('/encounters')) {
        return fulfillJson(r, mockEncountersResponse());
      }
      return r.continue();
    });

    let deleteCalled = false;
    await page.route('**/api/v1/encounters/enc_mock_001', (r) => {
      if (r.request().method() === 'DELETE') {
        deleteCalled = true;
        return fulfillJson(r, {
          status: 'success',
          message: 'Encounter cancelled',
          data: { id: 'enc_mock_001', status: 'cancelled' },
        });
      }
      return r.continue();
    });

    await page.goto('/encounters');
    await expect(page.getByRole('heading', { name: /encounters/i })).toBeVisible({
      timeout: 8_000,
    });

    // Click the "Remove" link/button
    const removeBtn = page.getByRole('button', { name: /remove/i });
    await removeBtn.click();

    // The confirm dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/remove the encounter/i)).toBeVisible();

    // Clicking outside the dialog (backdrop) should NOT trigger delete
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);
    expect(deleteCalled).toBe(false);
  });

  // ── 4. Cancel appointment: dialog appears and blocks accidental cancel ──
  test('cancel appointment shows confirm dialog and blocks accidental cancel', async ({ page }) => {
    await page.route('**/api/v1/appointments**', (r) => {
      const url = r.request().url();
      if (url.includes('/appointments?') || url.endsWith('/appointments')) {
        return fulfillJson(r, mockAppointmentsResponse());
      }
      return r.continue();
    });

    let cancelCalled = false;
    await page.route('**/api/v1/appointments/appt_mock_001/cancel', (r) => {
      if (r.request().method() === 'PATCH') {
        cancelCalled = true;
        return fulfillJson(r, {
          status: 'success',
          data: { _id: 'appt_mock_001', status: 'cancelled' },
        });
      }
      return r.continue();
    });

    await page.goto('/appointments');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 8_000 });

    // Click the "Cancel" button on the appointment card
    const cancelBtn = page.getByRole('button', { name: /cancel/i }).first();
    await cancelBtn.click();

    // The confirm dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/cancel this.*appointment/i)).toBeVisible();

    // The "Keep appointment" button should close the dialog without cancelling
    await page.getByRole('button', { name: /keep appointment/i }).click();
    await page.waitForTimeout(300);
    expect(cancelCalled).toBe(false);
  });

  // ── 5. Cancel appointment: confirming actually triggers the API call ─────
  test('cancel appointment confirm dialog proceeds when confirmed', async ({ page }) => {
    await page.route('**/api/v1/appointments**', (r) => {
      const url = r.request().url();
      if (url.includes('/appointments?') || url.endsWith('/appointments')) {
        return fulfillJson(r, mockAppointmentsResponse());
      }
      return r.continue();
    });

    let cancelCalled = false;
    await page.route('**/api/v1/appointments/appt_mock_001/cancel', (r) => {
      if (r.request().method() === 'PATCH') {
        cancelCalled = true;
        return fulfillJson(r, {
          status: 'success',
          data: { _id: 'appt_mock_001', status: 'cancelled' },
        });
      }
      return r.continue();
    });

    await page.goto('/appointments');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 8_000 });

    const cancelBtn = page.getByRole('button', { name: /cancel/i }).first();
    await cancelBtn.click();

    await expect(page.getByRole('dialog')).toBeVisible();

    // Confirm the cancellation
    const confirmBtn = page.getByRole('button', { name: /^cancel appointment$/i });
    await confirmBtn.click();

    await page.waitForTimeout(1000);
    expect(cancelCalled).toBe(true);
  });
});
