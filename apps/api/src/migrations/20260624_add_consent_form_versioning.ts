import { Db } from 'mongodb';

/**
 * Migration: Create ConsentForm collection with supporting indexes.
 * Also adds a formVersion field index on the consents collection.
 */
export async function up(db: Db): Promise<void> {
  // Unique index: one version string per clinic+type
  await db.collection('consentforms').createIndex(
    { clinicId: 1, type: 1, version: 1 },
    { unique: true, name: 'clinicId_1_type_1_version_1' }
  );

  // Fast lookup: latest form per clinic+type (sorted by effectiveDate desc)
  await db.collection('consentforms').createIndex(
    { clinicId: 1, type: 1, effectiveDate: -1 },
    { name: 'clinicId_1_type_1_effectiveDate_-1' }
  );

  // Index on existing consents.formVersion for populate queries
  await db.collection('consents').createIndex(
    { formVersion: 1 },
    { sparse: true, name: 'formVersion_1' }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('consentforms').dropIndex('clinicId_1_type_1_version_1').catch(() => {});
  await db.collection('consentforms').dropIndex('clinicId_1_type_1_effectiveDate_-1').catch(() => {});
  await db.collection('consents').dropIndex('formVersion_1').catch(() => {});
}
