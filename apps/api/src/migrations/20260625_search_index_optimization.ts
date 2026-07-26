import { Db } from 'mongodb';

/**
 * Add text indexes for full-text search and compound indexes for common
 * query patterns across high-traffic collections (#853).
 * All createIndex calls are idempotent — safe to re-run.
 */
export async function up(db: Db): Promise<void> {
  // ── Lab Results ────────────────────────────────────────────────────────────
  await db.collection('labresults').createIndex(
    { testName: 'text', testCode: 'text' },
    { background: true, name: 'labresults_text_search' }
  );
  await db.collection('labresults').createIndex(
    { clinicId: 1, patientId: 1, orderedAt: -1 },
    { background: true, name: 'labresults_clinicId_patientId_orderedAt' }
  );
  await db.collection('labresults').createIndex(
    { clinicId: 1, status: 1, orderedAt: -1 },
    { background: true, name: 'labresults_clinicId_status_orderedAt' }
  );

  // ── Appointments ─────────────────────────────────────────────────────────
  await db.collection('appointments').createIndex(
    { clinicId: 1, patientId: 1, status: 1 },
    { background: true, name: 'appointments_clinicId_patientId_status' }
  );
  await db.collection('appointments').createIndex(
    { clinicId: 1, doctorId: 1, status: 1, scheduledAt: 1 },
    { background: true, name: 'appointments_clinicId_doctorId_status_scheduledAt' }
  );

  // ── Notifications ─────────────────────────────────────────────────────────
  await db.collection('notifications').createIndex(
    { userId: 1, createdAt: -1 },
    { background: true, name: 'notifications_userId_createdAt' }
  );
  await db.collection('notifications').createIndex(
    { userId: 1, isRead: 1, createdAt: -1 },
    { background: true, name: 'notifications_userId_isRead_createdAt' }
  );

  // ── Audit Logs ────────────────────────────────────────────────────────────
  await db.collection('auditlogs').createIndex(
    { clinicId: 1, timestamp: -1 },
    { background: true, name: 'auditlogs_clinicId_timestamp' }
  );
  await db.collection('auditlogs').createIndex(
    { userId: 1, timestamp: -1 },
    { background: true, name: 'auditlogs_userId_timestamp' }
  );
  await db.collection('auditlogs').createIndex(
    { action: 1, timestamp: -1 },
    { background: true, name: 'auditlogs_action_timestamp' }
  );

  // ── Patients ──────────────────────────────────────────────────────────────
  await db.collection('patients').createIndex(
    { clinicId: 1, isActive: 1, createdAt: -1 },
    { background: true, name: 'patients_clinicId_isActive_createdAt' }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('labresults').dropIndex('labresults_text_search').catch(() => {});
  await db.collection('labresults').dropIndex('labresults_clinicId_patientId_orderedAt').catch(() => {});
  await db.collection('labresults').dropIndex('labresults_clinicId_status_orderedAt').catch(() => {});
  await db.collection('appointments').dropIndex('appointments_clinicId_patientId_status').catch(() => {});
  await db.collection('appointments').dropIndex('appointments_clinicId_doctorId_status_scheduledAt').catch(() => {});
  await db.collection('notifications').dropIndex('notifications_userId_createdAt').catch(() => {});
  await db.collection('notifications').dropIndex('notifications_userId_isRead_createdAt').catch(() => {});
  await db.collection('auditlogs').dropIndex('auditlogs_clinicId_timestamp').catch(() => {});
  await db.collection('auditlogs').dropIndex('auditlogs_userId_timestamp').catch(() => {});
  await db.collection('auditlogs').dropIndex('auditlogs_action_timestamp').catch(() => {});
  await db.collection('patients').dropIndex('patients_clinicId_isActive_createdAt').catch(() => {});
}
