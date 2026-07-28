import { Db } from 'mongodb';

/**
 * Add missing search-focused indexes for high-traffic patient and encounter queries.
 * All createIndex calls are idempotent and safe to re-run.
 */
export async function up(db: Db): Promise<void> {
  await db.collection('patients').createIndex(
    { firstName: 'text', lastName: 'text', searchName: 'text', systemId: 'text' },
    {
      background: true,
      name: 'patients_text_search',
      weights: { searchName: 10, lastName: 5, firstName: 5, systemId: 3 },
    }
  );

  await db
    .collection('patients')
    .createIndex(
      { clinicId: 1, isActive: 1, searchName: 1 },
      { background: true, name: 'patients_clinicId_isActive_searchName' }
    );

  await db
    .collection('patients')
    .createIndex(
      { clinicId: 1, lastName: 1, firstName: 1 },
      { background: true, name: 'patients_clinicId_lastName_firstName' }
    );

  await db
    .collection('patients')
    .createIndex(
      { clinicId: 1, riskLevel: 1, nextRiskReviewDate: 1 },
      { background: true, name: 'patients_clinicId_riskLevel_nextRiskReviewDate' }
    );

  await db
    .collection('encounters')
    .createIndex(
      { clinicId: 1, patientId: 1, status: 1, createdAt: -1 },
      { background: true, name: 'encounters_clinicId_patientId_status_createdAt' }
    );
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('patients')
    .dropIndex('patients_text_search')
    .catch(() => {});
  await db
    .collection('patients')
    .dropIndex('patients_clinicId_isActive_searchName')
    .catch(() => {});
  await db
    .collection('patients')
    .dropIndex('patients_clinicId_lastName_firstName')
    .catch(() => {});
  await db
    .collection('patients')
    .dropIndex('patients_clinicId_riskLevel_nextRiskReviewDate')
    .catch(() => {});
  await db
    .collection('encounters')
    .dropIndex('encounters_clinicId_patientId_status_createdAt')
    .catch(() => {});
}
