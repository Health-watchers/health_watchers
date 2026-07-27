import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  await db.createCollection('archives');

  await db.collection('archives').createIndex({ clinicId: 1, originalCollectionName: 1, archivedAt: -1 });
  await db.collection('archives').createIndex({ clinicId: 1, expiryDate: 1 });
  await db
    .collection('archives')
    .createIndex({ originalDocumentId: 1, originalCollectionName: 1 });
  await db.collection('archives').createIndex({ originalCollectionName: 1, archivedAt: -1 });
  await db.collection('archives').createIndex({ expiryDate: 1 }, { expireAfterSeconds: 0 }); // TTL index
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('archives')
    .drop()
    .catch(() => {});
}
