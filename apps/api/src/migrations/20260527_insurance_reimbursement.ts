import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  await db.createCollection('reimbursements').catch(() => {});

  await db
    .collection('reimbursements')
    .createIndex({ claimId: 1 }, { background: true, name: 'claimId_1', unique: true });

  await db
    .collection('reimbursements')
    .createIndex(
      { clinicId: 1, reimbursementStatus: 1 },
      { background: true, name: 'clinicId_1_reimbursementStatus_1' }
    );

  await db
    .collection('reimbursements')
    .createIndex({ createdAt: 1 }, { background: true, name: 'createdAt_1' });
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('reimbursements')
    .dropIndex('claimId_1')
    .catch(() => {});
  await db
    .collection('reimbursements')
    .dropIndex('clinicId_1_reimbursementStatus_1')
    .catch(() => {});
  await db
    .collection('reimbursements')
    .dropIndex('createdAt_1')
    .catch(() => {});
  await db.dropCollection('reimbursements').catch(() => {});
}
