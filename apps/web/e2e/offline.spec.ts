import { test, expect } from '@playwright/test';

test.describe('PWA Offline Support', () => {
  test('should display offline indicator when network is unavailable', async ({
    page,
    context,
  }) => {
    // Navigate to dashboard
    await page.goto('/dashboard');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Go offline
    await context.setOffline(true);

    // Check offline indicator is visible
    const offlineIndicator = page.locator('text=You are offline');
    await expect(offlineIndicator).toBeVisible();

    // Go back online
    await context.setOffline(false);

    // Offline indicator should disappear
    await expect(offlineIndicator).not.toBeVisible();
  });

  test('should cache patient list for offline access', async ({ page, context }) => {
    // Navigate to patients page
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');

    // Verify patient list is loaded
    const patientList = page.locator('[data-testid="patient-list"]');
    await expect(patientList).toBeVisible();

    // Go offline
    await context.setOffline(true);

    // Reload page
    await page.reload();

    // Patient list should still be visible (from cache)
    await expect(patientList).toBeVisible();

    // Go back online
    await context.setOffline(false);
  });

  test('should queue form submissions while offline', async ({ page, context }) => {
    // Navigate to create patient form
    await page.goto('/patients/new');
    await page.waitForLoadState('networkidle');

    // Go offline
    await context.setOffline(true);

    // Fill form
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');

    // Submit form
    await page.click('button[type="submit"]');

    // Should show offline message
    const offlineMessage = page.locator('text=offline');
    await expect(offlineMessage).toBeVisible();

    // Go back online
    await context.setOffline(false);

    // Form should be synced
    await page.waitForTimeout(2000);

    // Should show success message
    const successMessage = page.locator('text=success|created');
    await expect(successMessage).toBeVisible();
  });

  test('should use stale-while-revalidate for clinical data', async ({ page, context }) => {
    // Navigate to patient details
    await page.goto('/patients/123');
    await page.waitForLoadState('networkidle');

    // Get initial data
    const initialData = await page.locator('[data-testid="patient-data"]').textContent();

    // Go offline
    await context.setOffline(true);

    // Reload page
    await page.reload();

    // Data should still be visible (from cache)
    const cachedData = await page.locator('[data-testid="patient-data"]').textContent();
    expect(cachedData).toBe(initialData);

    // Go back online
    await context.setOffline(false);
  });

  test('should not cache PHI without explicit user action', async ({ page, context }) => {
    // Navigate to sensitive data page
    await page.goto('/patients/123/medical-records');
    await page.waitForLoadState('networkidle');

    // Go offline
    await context.setOffline(true);

    // Try to reload
    await page.reload();

    // Should show offline error (PHI not cached)
    const offlineError = page.locator('text=offline|not available');
    await expect(offlineError).toBeVisible();

    // Go back online
    await context.setOffline(false);
  });
});
