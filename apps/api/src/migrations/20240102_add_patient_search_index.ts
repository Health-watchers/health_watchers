import { Db } from 'mongodb';

/**
 * Add a text index on Patient.searchName for full-text search capability.
 * The existing btree index on searchName is kept; this adds a text index.
 */
export async function up(db: Db): Promise<void> {
  await db.collection('patients').createIndex(
    { searchName: 'text' },
    { background: true, name: 'searchName_text' }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('patients').dropIndex('searchName_text').catch(() => {});
}
