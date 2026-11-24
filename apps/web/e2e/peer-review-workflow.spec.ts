import { test, expect, Page } from '@playwright/test';

/**
 * End-to-end peer review workflow (#1688):
 *   author requests a review on the encounter page → reviewer sees it on the dashboard →
 *   reviewer completes the review → author sees the result → analytics reflect it.
 *
 * The API is mocked with an in-memory store so the flow is deterministic.
 */

const CLINIC_ID = 'clinic-1';
const AUTHOR = { userId: 'doc-author', fullName: 'Dr Ada Author', role: 'DOCTOR' };
const REVIEWER = { userId: 'doc-reviewer', fullName: 'Dr Rex Reviewer', role: 'DOCTOR' };
const ENCOUNTER_ID = '64b7f0c2a1b2c3d4e5f60789';

interface StoredReview {
  _id: string;
  encounterId: { _id: string; chiefComplaint: string; createdAt: string };
  reviewerId: { _id: string; fullName: string; role: string } | null;
  revieweeId: { _id: string; fullName: string; role: string };
  status: 'pending' | 'completed';
  isAnonymous: boolean;
  requestNote?: string;
  rating?: number;
  feedback?: string;
  recommendations?: string;
  categories?: Record<string, number>;
  requiresFollowUp?: boolean;
  createdAt: string;
  completedAt?: string;
}

interface Store {
  reviews: StoredReview[];
  notifications: { userId: string; title: string }[];
}

const encounter = {
  id: ENCOUNTER_ID,
  _id: ENCOUNTER_ID,
  attendingDoctorId: AUTHOR.userId,
  patientName: 'Jane Patient',
  patientMrn: 'MRN-001',
  doctor: AUTHOR.fullName,
  status: 'closed',
  chiefComplaint: 'Persistent cough',
  diagnosis: [],
  treatmentPlan: 'Rest and fluids',
  prescriptions: [],
  vitals: { bloodPressure: '120/80', heartRate: '72', temperature: '37', spo2: '98' },
  soapNotes: { subjective: 'Cough for 2 weeks', assessment: 'Viral URTI' },
  createdAt: '2026-10-01T09:00:00.000Z',
};

const json = (data: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify({ status: 'success', data }),
});

async function signInAs(page: Page, user: typeof AUTHOR) {
  await page.context().addCookies([
    { name: 'accessToken', value: 'e2e-token', url: 'http://localhost:3000' },
    { name: 'csrf-token', value: 'e2e-csrf', url: 'http://localhost:3000' },
  ]);
  await page.route('**/api/settings/me', (route) =>
    route.fulfill(
      json({
        userId: user.userId,
        fullName: user.fullName,
        email: `${user.userId}@example.com`,
        role: user.role,
        clinic: CLINIC_ID,
      })
    )
  );
  await page.route('**/api/auth/refresh', (route) => route.fulfill(json({})));
}

async function mockApi(page: Page, store: Store, user: typeof AUTHOR) {
  await page.route('**/api/v1/encounters/**', (route) => route.fulfill(json(encounter)));
  await page.route('**/api/v1/dashboard**', (route) => route.fulfill(json({ stats: {} })));

  await page.route('**/api/v1/peer-reviews**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^.*\/api\/v1\/peer-reviews/, '');
    const method = req.method();

    if (method === 'GET' && path === '/reviewers') {
      return route.fulfill(json([{ id: REVIEWER.userId, fullName: REVIEWER.fullName, role: 'DOCTOR' }]));
    }

    if (method === 'GET' && path.startsWith('/encounter/')) {
      const review = store.reviews.find((r) => r.encounterId._id === path.split('/')[2]) ?? null;
      const hideReviewer = review?.isAnonymous && user.userId !== REVIEWER.userId;
      return route.fulfill(json(review && hideReviewer ? { ...review, reviewerId: null } : review));
    }

    if (method === 'POST' && path === '') {
      const body = req.postDataJSON();
      const review: StoredReview = {
        _id: `pr-${store.reviews.length + 1}`,
        encounterId: {
          _id: body.encounterId,
          chiefComplaint: encounter.chiefComplaint,
          createdAt: encounter.createdAt,
        },
        reviewerId: { _id: body.reviewerId, fullName: REVIEWER.fullName, role: 'DOCTOR' },
        revieweeId: { _id: AUTHOR.userId, fullName: AUTHOR.fullName, role: 'DOCTOR' },
        status: 'pending',
        isAnonymous: Boolean(body.isAnonymous),
        requestNote: body.requestNote,
        createdAt: new Date().toISOString(),
      };
      store.reviews.push(review);
      store.notifications.push({ userId: body.reviewerId, title: 'Peer Review Requested' });
      return route.fulfill(json(review, 201));
    }

    if (method === 'GET' && path.startsWith('/assigned')) {
      const status = url.searchParams.get('status');
      return route.fulfill(
        json(
          store.reviews.filter(
            (r) => r.reviewerId?._id === user.userId && (!status || r.status === status)
          )
        )
      );
    }

    if (method === 'GET' && path === '/received') {
      return route.fulfill(
        json(
          store.reviews
            .filter((r) => r.revieweeId._id === user.userId && r.status === 'completed')
            .map((r) => (r.isAnonymous ? { ...r, reviewerId: null } : r))
        )
      );
    }

    if (method === 'GET' && path === '/analytics') {
      const done = store.reviews.filter((r) => r.status === 'completed');
      const avg = done.length ? done.reduce((s, r) => s + (r.rating ?? 0), 0) / done.length : null;
      return route.fulfill(
        json({
          totalReviews: done.length,
          pendingCount: store.reviews.length - done.length,
          averageRating: avg,
          categoryAverages: { documentation: 3, diagnosis: 4, treatment: 4, followUp: 2 },
          followUpCount: done.filter((r) => r.requiresFollowUp).length,
          ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({
            rating,
            count: done.filter((r) => r.rating === rating).length,
          })),
          monthlyTrend: [],
          commonThemes: done.length
            ? [{ key: 'documentation', label: 'Documentation completeness', count: 1, share: 1 }]
            : [],
        })
      );
    }

    if (method === 'PUT' && path.startsWith('/')) {
      const review = store.reviews.find((r) => r._id === path.slice(1));
      if (!review) return route.fulfill(json(null, 404));
      Object.assign(review, req.postDataJSON(), {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      store.notifications.push({ userId: review.revieweeId._id, title: 'Peer Review Completed' });
      return route.fulfill(json(review));
    }

    return route.fulfill(json([]));
  });
}

async function scoreRubric(page: Page, legend: RegExp, score: number) {
  await page
    .getByRole('group', { name: legend })
    .locator(`label:has(input[value="${score}"])`)
    .click();
}

test.describe('Peer review workflow', () => {
  const store: Store = { reviews: [], notifications: [] };

  test.describe.configure({ mode: 'serial' });

  test('author requests a peer review from the encounter detail page', async ({ page }) => {
    await signInAs(page, AUTHOR);
    await mockApi(page, store, AUTHOR);

    await page.goto(`/encounters/${ENCOUNTER_ID}`);
    const card = page.getByRole('heading', { name: 'Peer review' });
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: /request peer review/i }).click();
    const form = page.getByRole('form', { name: /request peer review/i });
    await form.getByLabel(/reviewer/i).selectOption(REVIEWER.userId);
    await form.getByLabel(/focus areas/i).fill('Please check the documentation');
    await form.getByRole('button', { name: /send request/i }).click();

    await expect(page.getByTestId('peer-review-status')).toContainText(/review pending/i);
    expect(store.reviews).toHaveLength(1);
    expect(store.notifications).toContainEqual({
      userId: REVIEWER.userId,
      title: 'Peer Review Requested',
    });
  });

  test('reviewer sees the pending review on the dashboard', async ({ page }) => {
    await signInAs(page, REVIEWER);
    await mockApi(page, store, REVIEWER);

    await page.goto('/');
    const widget = page.getByRole('region', { name: /pending peer reviews/i });
    await expect(widget).toBeVisible();
    await expect(widget).toContainText(encounter.chiefComplaint);
    await expect(widget).toContainText(AUTHOR.fullName);
  });

  test('reviewer completes the review with rating, comments and recommendations', async ({
    page,
  }) => {
    await signInAs(page, REVIEWER);
    await mockApi(page, store, REVIEWER);

    await page.goto('/peer-reviews');
    await page.getByRole('button', { name: /^review$/i }).first().click();

    await expect(page.getByText(/requested focus/i)).toContainText('documentation');

    await scoreRubric(page, /documentation/i, 3);
    await scoreRubric(page, /diagnosis/i, 4);
    await scoreRubric(page, /treatment/i, 4);
    await scoreRubric(page, /follow-up/i, 2);
    await scoreRubric(page, /overall rating/i, 3);
    await page.getByLabel('Comments').fill('SOAP note was missing the examination findings.');
    await page.getByLabel('Recommendations').fill('Document a full examination and safety-net.');
    await page.getByLabel(/requires follow-up/i).check();

    await page.getByRole('button', { name: /submit review/i }).click();
    await page.getByRole('button', { name: /confirm submission/i }).click();

    await expect(page.getByText(/peer review submitted/i)).toBeVisible();
    expect(store.reviews[0]).toMatchObject({
      status: 'completed',
      rating: 3,
      recommendations: 'Document a full examination and safety-net.',
      requiresFollowUp: true,
    });
    expect(store.notifications).toContainEqual({
      userId: AUTHOR.userId,
      title: 'Peer Review Completed',
    });
  });

  test('author sees the completed review and analytics', async ({ page }) => {
    await signInAs(page, AUTHOR);
    await mockApi(page, store, AUTHOR);

    await page.goto(`/encounters/${ENCOUNTER_ID}`);
    const status = page.getByTestId('peer-review-status');
    await expect(status).toContainText(/review completed/i);
    await expect(status).toContainText('3/5');
    await expect(status).toContainText('Document a full examination');

    await page.goto('/peer-reviews');
    await page.getByRole('tab', { name: /my encounters reviewed/i }).click();
    await expect(page.getByText(encounter.chiefComplaint)).toBeVisible();

    await page.getByRole('tab', { name: /analytics/i }).click();
    const analytics = page.getByTestId('peer-review-analytics');
    await expect(analytics).toContainText(/average rating/i);
    await expect(analytics).toContainText('3.0');
    await expect(analytics).toContainText(/documentation completeness/i);
  });
});
