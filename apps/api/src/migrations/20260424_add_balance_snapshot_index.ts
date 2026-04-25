import { Db } from 'mongodb';

/**
 * Add compound unique index on BalanceSnapshot { clinicId, date }
 * for efficient per-clinic daily snapshot queries and deduplication.
 */
export async function up(db: Db): Promise<void> {
  await db.collection('balancesnapshots').createIndex(
    { clinicId: 1, date: -1 },
    { unique: true, background: true, name: 'clinicId_1_date_-1' }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('balancesnapshots').dropIndex('clinicId_1_date_-1').catch(() => {});
}
