import { Db } from 'mongodb';

/**
 * Issue #1067 — MongoDB Index Analysis and Optimization
 *
 * Adds missing compound indexes for high-frequency query patterns that were
 * identified via query profiling:
 *
 *  - notifications: clinicId + userId + isRead (unread-count and list queries)
 *  - notifications: clinicId + createdAt (time-ordered notification feeds)
 *  - auditlogs:     clinicId + userId + createdAt (per-user audit timeline)
 *  - auditlogs:     clinicId + resourceType + createdAt (resource audit trail)
 *  - users:         clinicId + isActive + role (staff listing / access checks)
 *  - encounters:    attendingDoctorId + status + createdAt (doctor workload view)
 *  - paymentrecords: clinicId + patientId + status (patient billing view)
 *
 * All createIndex operations are idempotent (named indexes) and safe to re-run.
 */
export async function up(db: Db): Promise<void> {
  // ── Notifications ───────────────────────────────────────────────────────────
  await db.collection('notifications').createIndex(
    { clinicId: 1, userId: 1, isRead: 1 },
    { background: true, name: 'notifications_clinicId_userId_isRead' }
  );

  await db.collection('notifications').createIndex(
    { clinicId: 1, createdAt: -1 },
    { background: true, name: 'notifications_clinicId_createdAt' }
  );

  await db.collection('notifications').createIndex(
    { userId: 1, isRead: 1, createdAt: -1 },
    { background: true, name: 'notifications_userId_isRead_createdAt' }
  );

  // ── Audit Logs ──────────────────────────────────────────────────────────────
  await db.collection('auditlogs').createIndex(
    { clinicId: 1, userId: 1, createdAt: -1 },
    { background: true, name: 'auditlogs_clinicId_userId_createdAt' }
  );

  await db.collection('auditlogs').createIndex(
    { clinicId: 1, resourceType: 1, createdAt: -1 },
    { background: true, name: 'auditlogs_clinicId_resourceType_createdAt' }
  );

  await db.collection('auditlogs').createIndex(
    { clinicId: 1, action: 1, createdAt: -1 },
    { background: true, name: 'auditlogs_clinicId_action_createdAt' }
  );

  // ── Users ───────────────────────────────────────────────────────────────────
  // Covers active staff listing filtered by role within a clinic
  await db.collection('users').createIndex(
    { clinicId: 1, isActive: 1, role: 1 },
    { background: true, name: 'users_clinicId_isActive_role' }
  );

  // Covers text/name search within a clinic
  await db.collection('users').createIndex(
    { clinicId: 1, fullName: 1 },
    { background: true, name: 'users_clinicId_fullName' }
  );

  // ── Encounters (doctor workload) ────────────────────────────────────────────
  await db.collection('encounters').createIndex(
    { attendingDoctorId: 1, status: 1, createdAt: -1 },
    { background: true, name: 'encounters_attendingDoctorId_status_createdAt' }
  );

  // ── Payment Records (patient billing view) ──────────────────────────────────
  await db.collection('paymentrecords').createIndex(
    { clinicId: 1, patientId: 1, status: 1 },
    { background: true, name: 'paymentrecords_clinicId_patientId_status' }
  );

  await db.collection('paymentrecords').createIndex(
    { clinicId: 1, encounterId: 1 },
    { background: true, name: 'paymentrecords_clinicId_encounterId' }
  );
}

export async function down(db: Db): Promise<void> {
  const safe = (fn: Promise<any>) => fn.catch(() => {});

  await safe(db.collection('notifications').dropIndex('notifications_clinicId_userId_isRead'));
  await safe(db.collection('notifications').dropIndex('notifications_clinicId_createdAt'));
  await safe(db.collection('notifications').dropIndex('notifications_userId_isRead_createdAt'));

  await safe(db.collection('auditlogs').dropIndex('auditlogs_clinicId_userId_createdAt'));
  await safe(db.collection('auditlogs').dropIndex('auditlogs_clinicId_resourceType_createdAt'));
  await safe(db.collection('auditlogs').dropIndex('auditlogs_clinicId_action_createdAt'));

  await safe(db.collection('users').dropIndex('users_clinicId_isActive_role'));
  await safe(db.collection('users').dropIndex('users_clinicId_fullName'));

  await safe(db.collection('encounters').dropIndex('encounters_attendingDoctorId_status_createdAt'));

  await safe(db.collection('paymentrecords').dropIndex('paymentrecords_clinicId_patientId_status'));
  await safe(db.collection('paymentrecords').dropIndex('paymentrecords_clinicId_encounterId'));
}
