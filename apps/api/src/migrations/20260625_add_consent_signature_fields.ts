import { Db } from 'mongodb';

/**
 * Add digital-signature fields to existing consent records.
 * New fields: signatureData, signedAt, signatureHash, userAgent
 *
 * Existing records get null defaults so the schema remains consistent.
 * The up() is idempotent: $exists guards prevent double-writes.
 */
export async function up(db: Db): Promise<void> {
  await db.collection('consents').updateMany(
    { signatureHash: { $exists: false } },
    {
      $set: {
        signatureData: null,
        signedAt: null,
        signatureHash: null,
        userAgent: null,
      },
    }
  );

  // Compound index for fast signature verification lookups
  await db.collection('consents').createIndex(
    { patientId: 1, clinicId: 1, signatureHash: 1 },
    { background: true, sparse: true, name: 'patientId_1_clinicId_1_signatureHash_1' }
  );
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('consents')
    .dropIndex('patientId_1_clinicId_1_signatureHash_1')
    .catch(() => {});

  await db.collection('consents').updateMany(
    {},
    { $unset: { signatureData: '', signedAt: '', signatureHash: '', userAgent: '' } }
  );
}
