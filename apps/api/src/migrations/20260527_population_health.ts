import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  await db.createCollection('populationhealth').catch(() => {});

  await db
    .collection('populationhealth')
    .createIndex(
      { clinicId: 1, generatedAt: -1 },
      { background: true, name: 'clinicId_1_generatedAt_-1' }
    );

  await db.collection('populationhealth').createIndex(
    { generatedAt: 1 },
    { background: true, name: 'generatedAt_1', expireAfterSeconds: 31536000 } // 1 year TTL
  );
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('populationhealth')
    .dropIndex('clinicId_1_generatedAt_-1')
    .catch(() => {});
  await db
    .collection('populationhealth')
    .dropIndex('generatedAt_1')
    .catch(() => {});
  await db.dropCollection('populationhealth').catch(() => {});
}
