import { Db } from 'mongodb';

/**
 * Migration: Add base schema fields (isActive, createdBy) to all clinic-scoped collections.
 *
 * This migration ensures that every collection has the `isActive` and `createdBy` fields
 * added with sensible defaults, so that the shared baseSchema is consistently applied.
 *
 * - `isActive` defaults to `true` for existing documents
 * - `createdBy` is left null for existing documents (can be backfilled separately)
 */
export async function up(db: Db): Promise<void> {
  const collections = [
    'appointments',
    'encounters',
    'patients',
    'users',
    'clinics',
    'insurance_claims',
    'credit_notes',
    'insurance_verifications',
    'webhooks',
    'subscriptions',
    'notifications',
    'consents',
    'archive_records',
    'export_requests',
    'export_schedules',
    'feature_flags',
    'cds_rules',
    'breach_incidents',
    'erasure_requests',
    'clinic_keypairs',
    'clinic_settings',
    'communication_logs',
    'baa_agreements',
    'patient_health_logs',
    'lab_results',
    'medication_histories',
    'immunizations',
    'invoices',
    'cpt_codes',
    'triage_queue',
    'ai_population_health',
  ];

  for (const collectionName of collections) {
    // Add isActive field with default true where it doesn't exist
    await db.collection(collectionName).updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } },
    );

    // Add createdBy field where it doesn't exist (nullable)
    await db.collection(collectionName).updateMany(
      { createdBy: { $exists: false } },
      { $set: { createdBy: null } },
    );
  }
}

export async function down(db: Db): Promise<void> {
  // Revert: remove the added fields (best-effort, for rollback scenarios)
  const collections = [
    'appointments',
    'encounters',
    'patients',
    'users',
    'clinics',
    'insurance_claims',
    'credit_notes',
    'insurance_verifications',
    'webhooks',
    'subscriptions',
    'notifications',
    'consents',
    'archive_records',
    'export_requests',
    'export_schedules',
    'feature_flags',
    'cds_rules',
    'breach_incidents',
    'erasure_requests',
    'clinic_keypairs',
    'clinic_settings',
    'communication_logs',
    'baa_agreements',
    'patient_health_logs',
    'lab_results',
    'medication_histories',
    'immunizations',
    'invoices',
    'cpt_codes',
    'triage_queue',
    'ai_population_health',
  ];

  for (const collectionName of collections) {
    await db.collection(collectionName).updateMany(
      {},
      { $unset: { isActive: '', createdBy: '' } },
    );
  }
}
