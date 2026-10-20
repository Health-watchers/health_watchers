/**
 * Migration: 20260928_billing_workbench_indexes
 *
 * Adds a compound index on encounters to efficiently power the Billing Workbench
 * unbilled / denied encounter queries (Issue #1428).
 *
 * Index supports:
 *   - Filter by { clinicId, 'billing.billingStatus' }
 *   - Sort by { createdAt } (date), { 'billing.totalFee' } (amount)
 *
 * The `date` field in the index name maps to the Mongoose `createdAt` timestamp.
 */
import { Db } from 'mongodb';

export const INDEX_NAME = 'clinicId_1_billingStatus_1_date_1';

export async function up(db: Db): Promise<void> {
  await db.collection('encounters').createIndex(
    {
      clinicId: 1,
      'billing.billingStatus': 1,
      createdAt: -1,
    },
    {
      background: true,
      name: INDEX_NAME,
    }
  );

  // Secondary index for amount-based sorting within a billing status
  await db.collection('encounters').createIndex(
    {
      clinicId: 1,
      'billing.billingStatus': 1,
      'billing.totalFee': -1,
    },
    {
      background: true,
      name: 'clinicId_1_billingStatus_1_totalFee_-1',
    }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('encounters').dropIndex(INDEX_NAME).catch(() => {});
  await db
    .collection('encounters')
    .dropIndex('clinicId_1_billingStatus_1_totalFee_-1')
    .catch(() => {});
}
