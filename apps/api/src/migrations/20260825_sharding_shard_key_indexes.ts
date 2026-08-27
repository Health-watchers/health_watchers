/**
 * Migration: 20260825_sharding_shard_key_indexes
 *
 * Issue #1077 — Database Sharding Strategy
 *
 * Creates compound indexes on each sharded collection to support efficient
 * shard-key routing.  All operations are idempotent and safe to re-run.
 */

import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // ── Encounters — shard key: clinicId (hashed) ────────────────────────────
  await db
    .collection('encounters')
    .createIndex({ clinicId: 1 }, { background: true, name: 'encounters_shardKey_clinicId' });

  // ── Patients — shard key: clinicId (hashed) ──────────────────────────────
  await db
    .collection('patients')
    .createIndex({ clinicId: 1 }, { background: true, name: 'patients_shardKey_clinicId' });

  // ── CommunicationLog — shard key: createdAt (range/monthly) ─────────────
  await db
    .collection('communicationlogs')
    .createIndex(
      { createdAt: 1 },
      { background: true, name: 'communicationlogs_shardKey_createdAt' },
    );

  // ── AuditLog — shard key: clinicId (hashed) ─────────────────────────────
  await db
    .collection('auditlogs')
    .createIndex({ clinicId: 1 }, { background: true, name: 'auditlogs_shardKey_clinicId' });

  // ── HealthLog — shard key: patientId (hashed) ────────────────────────────
  await db
    .collection('healthlogs')
    .createIndex({ patientId: 1 }, { background: true, name: 'healthlogs_shardKey_patientId' });

  // ── Chunk-migration tracking ─────────────────────────────────────────────
  await db.collection('chunk_migrations').createIndex(
    { status: 1, scheduledAt: 1 },
    {
      background: true,
      name: 'chunk_migrations_status_scheduledAt',
    },
  );

  // ── Shard statistics TTL index (keep 90 days) ────────────────────────────
  // Only create if the collection already exists (created by infrastructure migration).
  const collections = await db
    .listCollections({ name: 'shard_statistics' })
    .toArray();
  if (collections.length > 0) {
    await db.collection('shard_statistics').createIndex(
      { recordedAt: 1 },
      {
        background: true,
        name: 'shard_statistics_ttl',
        expireAfterSeconds: 7_776_000, // 90 days
      },
    );
  }
}

export async function down(db: Db): Promise<void> {
  const drop = (col: string, idx: string) =>
    db.collection(col).dropIndex(idx).catch(() => {
      /* already gone */
    });

  await drop('encounters', 'encounters_shardKey_clinicId');
  await drop('patients', 'patients_shardKey_clinicId');
  await drop('communicationlogs', 'communicationlogs_shardKey_createdAt');
  await drop('auditlogs', 'auditlogs_shardKey_clinicId');
  await drop('healthlogs', 'healthlogs_shardKey_patientId');
  await drop('chunk_migrations', 'chunk_migrations_status_scheduledAt');
  await drop('shard_statistics', 'shard_statistics_ttl');
}
