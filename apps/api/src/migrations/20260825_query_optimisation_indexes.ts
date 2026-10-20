import { Db } from 'mongodb';

/**
 * Issue #1062 — Optimize Database Queries
 *
 * Adds targeted compound indexes for the slowest query patterns
 * identified during profiling across high-traffic collections.
 *
 * Profiling findings:
 *  - encounters: list-by-patient and list-by-clinic lack a covering index
 *    on (clinicId, patientId, status, createdAt).
 *  - payments: payment history lookup scans the full collection when
 *    filtering by clinicId + patientId + status.
 *  - invoices: outstanding-invoice queries (status != paid) had no index.
 *  - webhooks: retry-worker scans for (status, nextRetryAt) without an index.
 *  - immunizations: compliance queries scan by clinicId + dueDate.
 *  - medications (history): per-patient lookups lack a compound index.
 *
 * All createIndex calls are idempotent — safe to re-run.
 */
export async function up(db: Db): Promise<void> {
  // ── Encounters ─────────────────────────────────────────────────────────────
  // Pattern: list encounters for a patient within a clinic, newest first
  await db
    .collection('encounters')
    .createIndex(
      { clinicId: 1, patientId: 1, createdAt: -1 },
      { background: true, name: 'encounters_clinicId_patientId_createdAt' }
    );

  // Pattern: list encounters by clinic + status (e.g. "open" follow-ups)
  await db
    .collection('encounters')
    .createIndex(
      { clinicId: 1, status: 1, createdAt: -1 },
      { background: true, name: 'encounters_clinicId_status_createdAt' }
    );

  // Pattern: follow-up queue — encounters needing review, ordered by followUpDate
  await db.collection('encounters').createIndex(
    { clinicId: 1, followUpDate: 1, status: 1 },
    {
      background: true,
      name: 'encounters_clinicId_followUpDate_status',
      partialFilterExpression: { followUpDate: { $exists: true } },
    }
  );

  // ── Payments ───────────────────────────────────────────────────────────────
  // Pattern: payment history per patient within a clinic, newest first
  await db
    .collection('paymentrecords')
    .createIndex(
      { clinicId: 1, patientId: 1, createdAt: -1 },
      { background: true, name: 'payments_clinicId_patientId_createdAt' }
    );

  // Pattern: filter by status (pending / confirmed / failed) within a clinic
  await db
    .collection('paymentrecords')
    .createIndex(
      { clinicId: 1, status: 1, createdAt: -1 },
      { background: true, name: 'payments_clinicId_status_createdAt' }
    );

  // Pattern: expiration job — scan for expiring payment intents
  await db.collection('paymentrecords').createIndex(
    { status: 1, expiresAt: 1 },
    {
      background: true,
      name: 'payments_status_expiresAt',
      partialFilterExpression: { expiresAt: { $exists: true } },
    }
  );

  // ── Invoices ───────────────────────────────────────────────────────────────
  // Pattern: outstanding invoices per clinic (status != 'paid')
  await db
    .collection('invoices')
    .createIndex(
      { clinicId: 1, status: 1, createdAt: -1 },
      { background: true, name: 'invoices_clinicId_status_createdAt' }
    );

  // Pattern: invoices for a specific patient
  await db
    .collection('invoices')
    .createIndex(
      { clinicId: 1, patientId: 1, createdAt: -1 },
      { background: true, name: 'invoices_clinicId_patientId_createdAt' }
    );

  // ── Webhooks ───────────────────────────────────────────────────────────────
  // Pattern: retry-worker scans for pending deliveries with nextRetryAt <= now
  await db.collection('webhookdeliveries').createIndex(
    { status: 1, nextRetryAt: 1 },
    {
      background: true,
      name: 'webhooks_status_nextRetryAt',
      partialFilterExpression: { status: { $in: ['pending', 'retrying'] } },
    }
  );

  // ── Immunizations ──────────────────────────────────────────────────────────
  // Pattern: compliance report — vaccinations due per clinic before a date
  await db.collection('immunizations').createIndex(
    { clinicId: 1, dueDate: 1, status: 1 },
    {
      background: true,
      name: 'immunizations_clinicId_dueDate_status',
      partialFilterExpression: { dueDate: { $exists: true } },
    }
  );

  // ── Medication History ─────────────────────────────────────────────────────
  // Pattern: list medication history for a patient, newest first
  await db
    .collection('medicationhistories')
    .createIndex(
      { patientId: 1, clinicId: 1, createdAt: -1 },
      { background: true, name: 'medications_patientId_clinicId_createdAt' }
    );

  // ── Care Plans ─────────────────────────────────────────────────────────────
  // Pattern: active care plans per patient within a clinic
  await db
    .collection('careplans')
    .createIndex(
      { clinicId: 1, patientId: 1, status: 1 },
      { background: true, name: 'careplans_clinicId_patientId_status' }
    );

  // ── Referrals ──────────────────────────────────────────────────────────────
  // Pattern: referrals list per clinic, sorted by date
  await db
    .collection('referrals')
    .createIndex(
      { clinicId: 1, status: 1, createdAt: -1 },
      { background: true, name: 'referrals_clinicId_status_createdAt' }
    );
}

export async function down(db: Db): Promise<void> {
  // Encounters
  await db
    .collection('encounters')
    .dropIndex('encounters_clinicId_patientId_createdAt')
    .catch(() => {});
  await db
    .collection('encounters')
    .dropIndex('encounters_clinicId_status_createdAt')
    .catch(() => {});
  await db
    .collection('encounters')
    .dropIndex('encounters_clinicId_followUpDate_status')
    .catch(() => {});

  // Payments
  await db
    .collection('paymentrecords')
    .dropIndex('payments_clinicId_patientId_createdAt')
    .catch(() => {});
  await db
    .collection('paymentrecords')
    .dropIndex('payments_clinicId_status_createdAt')
    .catch(() => {});
  await db
    .collection('paymentrecords')
    .dropIndex('payments_status_expiresAt')
    .catch(() => {});

  // Invoices
  await db
    .collection('invoices')
    .dropIndex('invoices_clinicId_status_createdAt')
    .catch(() => {});
  await db
    .collection('invoices')
    .dropIndex('invoices_clinicId_patientId_createdAt')
    .catch(() => {});

  // Webhooks
  await db
    .collection('webhookdeliveries')
    .dropIndex('webhooks_status_nextRetryAt')
    .catch(() => {});

  // Immunizations
  await db
    .collection('immunizations')
    .dropIndex('immunizations_clinicId_dueDate_status')
    .catch(() => {});

  // Medications
  await db
    .collection('medicationhistories')
    .dropIndex('medications_patientId_clinicId_createdAt')
    .catch(() => {});

  // Care plans
  await db
    .collection('careplans')
    .dropIndex('careplans_clinicId_patientId_status')
    .catch(() => {});

  // Referrals
  await db
    .collection('referrals')
    .dropIndex('referrals_clinicId_status_createdAt')
    .catch(() => {});
}
