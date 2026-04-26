import { Db } from 'mongodb';

/**
 * Replace the single-field searchName text index with a compound text index
 * covering firstName, lastName, and systemId for full-text search (#338).
 */
export async function up(db: Db): Promise<void> {
  // Drop old single-field text index if it exists
  await db.collection('patients').dropIndex('searchName_text').catch(() => {});

  await db.collection('patients').createIndex(
    { firstName: 'text', lastName: 'text', systemId: 'text' },
    { background: true, name: 'patient_text_search' }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('patients').dropIndex('patient_text_search').catch(() => {});

  // Restore original single-field text index
  await db.collection('patients').createIndex(
    { searchName: 'text' },
    { background: true, name: 'searchName_text' }
  );
}
