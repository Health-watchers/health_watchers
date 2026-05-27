import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Create InsuranceClaim collection with indexes
  await db.createCollection('insuranceclaims').catch(() => {});

  // Create indexes
  await db.collection('insuranceclaims').createIndex(
    { claimId: 1 },
    { unique: true, background: true, name: 'claimId_1' }
  );

  await db.collection('insuranceclaims').createIndex(
    { clinicId: 1, submissionDate: -1 },
    { background: true, name: 'clinicId_1_submissionDate_-1' }
  );

  await db.collection('insuranceclaims').createIndex(
    { status: 1, clinicId: 1 },
    { background: true, name: 'status_1_clinicId_1' }
  );

  await db.collection('insuranceclaims').createIndex(
    { claimHash: 1, clinicId: 1 },
    { background: true, name: 'claimHash_1_clinicId_1' }
  );

  await db.collection('insuranceclaims').createIndex(
    { patientId: 1, clinicId: 1 },
    { background: true, name: 'patientId_1_clinicId_1' }
  );

  await db.collection('insuranceclaims').createIndex(
    { insuranceClaimNumber: 1 },
    { sparse: true, background: true, name: 'insuranceClaimNumber_1' }
  );

  await db.collection('insuranceclaims').createIndex(
    { stellarTxHash: 1 },
    { sparse: true, background: true, name: 'stellarTxHash_1' }
  );
}

export async function down(db: Db): Promise<void> {
  // Drop collection
  await db.collection('insuranceclaims').drop().catch(() => {});
}
