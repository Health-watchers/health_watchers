import mongoose from 'mongoose';
import logger from './logger';

interface IndexStats {
  name: string;
  accesses: { ops: number; since: Date };
}

interface CollectionIndexReport {
  collection: string;
  indexes: IndexStats[];
  unusedIndexes: string[];
}

const MONITORED_COLLECTIONS = [
  'patients',
  'encounters',
  'appointments',
  'labresults',
  'paymentrecords',
  'users',
  'notifications',
  'auditlogs',
  'referrals',
  'invoices',
];

async function getCollectionIndexStats(collectionName: string): Promise<CollectionIndexReport> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  const stats = await db
    .collection(collectionName)
    .aggregate<IndexStats>([{ $indexStats: {} }])
    .toArray();

  stats.sort((a, b) => b.accesses.ops - a.accesses.ops);

  const unusedIndexes = stats
    .filter((s) => s.accesses.ops === 0 && s.name !== '_id_')
    .map((s) => s.name);

  return { collection: collectionName, indexes: stats, unusedIndexes };
}

/** Logs index usage across all monitored collections. Call periodically to monitor coverage. */
export async function logIndexUsage(): Promise<void> {
  for (const col of MONITORED_COLLECTIONS) {
    try {
      const report = await getCollectionIndexStats(col);
      if (report.unusedIndexes.length > 0) {
        logger.warn(
          { collection: col, unusedIndexes: report.unusedIndexes },
          'Unused indexes detected — consider dropping them'
        );
      }
      logger.info(
        { collection: col, indexCount: report.indexes.length, unusedCount: report.unusedIndexes.length },
        'Index usage report'
      );
    } catch {
      // collection may not exist in all environments — safe to skip
    }
  }
}

/** Returns the raw index stats for a single collection. */
export async function getIndexStats(collectionName: string): Promise<CollectionIndexReport> {
  return getCollectionIndexStats(collectionName);
}
