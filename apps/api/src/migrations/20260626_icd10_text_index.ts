import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  const collection = db.collection('icd10codes');
  // Drop old single-field text index if present
  await collection.dropIndex('description_text').catch(() => {});
  await collection.createIndex(
    { description: 'text', code: 'text' },
    { name: 'icd10_text_search', weights: { description: 10, code: 5 }, background: true }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('icd10codes').dropIndex('icd10_text_search').catch(() => {});
  // Restore single-field index
  await db.collection('icd10codes').createIndex(
    { description: 'text' },
    { background: true }
  );
}
