import { Db } from 'mongodb';

/**
 * Create indexes for Patient, User, Encounter, and PaymentRecord collections.
 * All createIndex calls use { background: true } and are idempotent.
 */
export async function up(db: Db): Promise<void> {
  // Patient
  await db.collection('patients').createIndex({ systemId: 1 }, { unique: true, background: true, name: 'systemId_unique' });
  await db.collection('patients').createIndex({ searchName: 1 }, { background: true, name: 'searchName_1' });
  await db.collection('patients').createIndex({ clinicId: 1 }, { background: true, name: 'clinicId_1' });
  await db.collection('patients').createIndex({ isActive: 1 }, { background: true, name: 'isActive_1' });

  // User
  await db.collection('users').createIndex({ email: 1 }, { unique: true, background: true, name: 'email_unique' });
  await db.collection('users').createIndex({ isActive: 1 }, { background: true, name: 'isActive_1' });
  await db.collection('users').createIndex({ resetPasswordExpiresAt: 1 }, { background: true, name: 'resetPasswordExpiresAt_1' });
  await db.collection('users').createIndex({ lockedUntil: 1 }, { background: true, name: 'lockedUntil_1' });

  // Encounter
  await db.collection('encounters').createIndex({ patientId: 1 }, { background: true, name: 'patientId_1' });
  await db.collection('encounters').createIndex({ clinicId: 1 }, { background: true, name: 'clinicId_1' });
  await db.collection('encounters').createIndex({ attendingDoctorId: 1 }, { background: true, name: 'attendingDoctorId_1' });
  await db.collection('encounters').createIndex({ status: 1 }, { background: true, name: 'status_1' });
  await db.collection('encounters').createIndex({ isActive: 1 }, { background: true, name: 'isActive_1' });

  // PaymentRecord
  await db.collection('paymentrecords').createIndex({ intentId: 1 }, { unique: true, background: true, name: 'intentId_unique' });
  await db.collection('paymentrecords').createIndex({ status: 1 }, { background: true, name: 'status_1' });
  await db.collection('paymentrecords').createIndex({ clinicId: 1 }, { background: true, name: 'clinicId_1' });
  await db.collection('paymentrecords').createIndex({ patientId: 1 }, { background: true, name: 'patientId_1' });
  await db.collection('paymentrecords').createIndex({ status: 1, createdAt: 1 }, { background: true, name: 'status_1_createdAt_1' });
}

export async function down(db: Db): Promise<void> {
  await db.collection('patients').dropIndex('systemId_unique').catch(() => {});
  await db.collection('patients').dropIndex('searchName_1').catch(() => {});
  await db.collection('patients').dropIndex('clinicId_1').catch(() => {});
  await db.collection('patients').dropIndex('isActive_1').catch(() => {});

  await db.collection('users').dropIndex('email_unique').catch(() => {});
  await db.collection('users').dropIndex('isActive_1').catch(() => {});
  await db.collection('users').dropIndex('resetPasswordExpiresAt_1').catch(() => {});
  await db.collection('users').dropIndex('lockedUntil_1').catch(() => {});

  await db.collection('encounters').dropIndex('patientId_1').catch(() => {});
  await db.collection('encounters').dropIndex('clinicId_1').catch(() => {});
  await db.collection('encounters').dropIndex('attendingDoctorId_1').catch(() => {});
  await db.collection('encounters').dropIndex('status_1').catch(() => {});
  await db.collection('encounters').dropIndex('isActive_1').catch(() => {});

  await db.collection('paymentrecords').dropIndex('intentId_unique').catch(() => {});
  await db.collection('paymentrecords').dropIndex('status_1').catch(() => {});
  await db.collection('paymentrecords').dropIndex('clinicId_1').catch(() => {});
  await db.collection('paymentrecords').dropIndex('patientId_1').catch(() => {});
  await db.collection('paymentrecords').dropIndex('status_1_createdAt_1').catch(() => {});
}
