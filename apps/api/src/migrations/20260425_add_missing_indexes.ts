import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // ── EncounterModel indexes ──────────────────────────────────────────────────
  await db
    .collection('encounters')
    .createIndex(
      { clinicId: 1, createdAt: -1 },
      { background: true, name: 'clinicId_1_createdAt_-1' }
    );
  await db
    .collection('encounters')
    .createIndex(
      { patientId: 1, createdAt: -1 },
      { background: true, name: 'patientId_1_createdAt_-1' }
    );
  await db
    .collection('encounters')
    .createIndex(
      { clinicId: 1, patientId: 1, status: 1 },
      { background: true, name: 'clinicId_1_patientId_1_status_1' }
    );
  await db
    .collection('encounters')
    .createIndex(
      { encounteredBy: 1, createdAt: -1 },
      { background: true, name: 'encounteredBy_1_createdAt_-1' }
    );

  // ── PaymentRecordModel indexes ──────────────────────────────────────────────
  await db
    .collection('paymentrecords')
    .createIndex(
      { clinicId: 1, createdAt: -1 },
      { background: true, name: 'clinicId_1_createdAt_-1' }
    );
  await db
    .collection('paymentrecords')
    .createIndex({ clinicId: 1, status: 1 }, { background: true, name: 'clinicId_1_status_1' });
  await db
    .collection('paymentrecords')
    .createIndex({ txHash: 1 }, { background: true, sparse: true, name: 'txHash_1_sparse' });
  await db
    .collection('paymentrecords')
    .createIndex(
      { idempotencyKey: 1 },
      { background: true, unique: true, sparse: true, name: 'idempotencyKey_1_unique_sparse' }
    );

  // ── AuditLogModel indexes ───────────────────────────────────────────────────
  await db
    .collection('audit_logs')
    .createIndex(
      { clinicId: 1, createdAt: -1, _id: -1 },
      { background: true, name: 'clinicId_1_createdAt_-1__id_-1' }
    );

  // ── UserModel indexes ───────────────────────────────────────────────────────
  await db
    .collection('users')
    .createIndex({ clinicId: 1, role: 1 }, { background: true, name: 'clinicId_1_role_1' });
  await db
    .collection('users')
    .createIndex({ clinicId: 1, isActive: 1 }, { background: true, name: 'clinicId_1_isActive_1' });
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('encounters')
    .dropIndex('clinicId_1_createdAt_-1')
    .catch(() => {});
  await db
    .collection('encounters')
    .dropIndex('patientId_1_createdAt_-1')
    .catch(() => {});
  await db
    .collection('encounters')
    .dropIndex('clinicId_1_patientId_1_status_1')
    .catch(() => {});
  await db
    .collection('encounters')
    .dropIndex('encounteredBy_1_createdAt_-1')
    .catch(() => {});
  await db
    .collection('paymentrecords')
    .dropIndex('clinicId_1_createdAt_-1')
    .catch(() => {});
  await db
    .collection('paymentrecords')
    .dropIndex('clinicId_1_status_1')
    .catch(() => {});
  await db
    .collection('paymentrecords')
    .dropIndex('txHash_1_sparse')
    .catch(() => {});
  await db
    .collection('paymentrecords')
    .dropIndex('idempotencyKey_1_unique_sparse')
    .catch(() => {});
  await db
    .collection('audit_logs')
    .dropIndex('clinicId_1_createdAt_-1__id_-1')
    .catch(() => {});
  await db
    .collection('users')
    .dropIndex('clinicId_1_role_1')
    .catch(() => {});
  await db
    .collection('users')
    .dropIndex('clinicId_1_isActive_1')
    .catch(() => {});
}
