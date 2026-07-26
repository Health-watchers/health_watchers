import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Create health score collection with indexes
  await db.createCollection('healthscores').catch(() => {});
  await db
    .collection('healthscores')
    .createIndex({ patientId: 1 }, { background: true, name: 'patientId_1', unique: true });
  await db
    .collection('healthscores')
    .createIndex(
      { clinicId: 1, healthScore: 1 },
      { background: true, name: 'clinicId_1_healthScore_1' }
    );
  await db
    .collection('healthscores')
    .createIndex(
      { healthScoreLastCalculated: 1 },
      { background: true, name: 'healthScoreLastCalculated_1' }
    );
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('healthscores')
    .dropIndex('patientId_1')
    .catch(() => {});
  await db
    .collection('healthscores')
    .dropIndex('clinicId_1_healthScore_1')
    .catch(() => {});
  await db
    .collection('healthscores')
    .dropIndex('healthScoreLastCalculated_1')
    .catch(() => {});
  await db.dropCollection('healthscores').catch(() => {});
}
