import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  await db.createCollection('recurringpayments');
  await db
    .collection('recurringpayments')
    .createIndex({ clinicId: 1, status: 1, nextPaymentDate: 1 });
  await db.collection('recurringpayments').createIndex({ patientId: 1 });
  await db.collection('recurringpayments').createIndex({ status: 1, nextPaymentDate: 1 });
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('recurringpayments')
    .drop()
    .catch(() => {});
}
