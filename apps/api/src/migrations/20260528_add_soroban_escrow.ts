import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add Soroban escrow fields to PaymentRecord collection
  await db.collection('paymentrecords').updateMany(
    {},
    {
      $set: {
        sorobanContractId: null,
        escrowStatus: null,
        escrowReleasedAt: null,
      },
    }
  );

  // Create indexes for escrow fields
  await db
    .collection('paymentrecords')
    .createIndex(
      { sorobanContractId: 1 },
      { background: true, name: 'sorobanContractId_1', sparse: true }
    );

  await db
    .collection('paymentrecords')
    .createIndex(
      { escrowStatus: 1, createdAt: -1 },
      { background: true, name: 'escrowStatus_1_createdAt_-1' }
    );
}

export async function down(db: Db): Promise<void> {
  // Remove Soroban escrow fields
  await db.collection('paymentrecords').updateMany(
    {},
    {
      $unset: {
        sorobanContractId: '',
        escrowStatus: '',
        escrowReleasedAt: '',
      },
    }
  );

  // Drop indexes
  await db
    .collection('paymentrecords')
    .dropIndex('sorobanContractId_1')
    .catch(() => {});
  await db
    .collection('paymentrecords')
    .dropIndex('escrowStatus_1_createdAt_-1')
    .catch(() => {});
}
