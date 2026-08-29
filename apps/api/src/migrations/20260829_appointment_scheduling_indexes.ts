/**
 * Migration: Appointment scheduling system — analytics indexes + templates collection
 *
 * up:
 *   1. Add performance indexes on the appointments collection for analytics queries
 *      (grouping by status, type, and date range per clinic / per doctor).
 *   2. Create the appointmenttemplates collection with its required indexes.
 *
 * down:
 *   Removes all indexes and the templates collection added by this migration.
 */

import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // ── 1. Analytics indexes on the appointments collection ───────────────────

  // Compound index for per-clinic analytics over a date range
  await db.collection('appointments').createIndex(
    { clinicId: 1, scheduledAt: 1, status: 1 },
    { background: true, name: 'clinicId_1_scheduledAt_1_status_1' },
  );

  // Compound index for per-doctor analytics
  await db.collection('appointments').createIndex(
    { doctorId: 1, clinicId: 1, scheduledAt: 1, status: 1 },
    { background: true, name: 'doctorId_1_clinicId_1_scheduledAt_1_status_1' },
  );

  // Sparse index to speed up telemedicine-specific queries
  await db.collection('appointments').createIndex(
    { clinicId: 1, isTelemedicine: 1, scheduledAt: 1 },
    { background: true, name: 'clinicId_1_isTelemedicine_1_scheduledAt_1', sparse: true },
  );

  // ── 2. AppointmentTemplates collection ────────────────────────────────────

  // Ensure collection exists
  const collections = await db.listCollections({ name: 'appointmenttemplates' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('appointmenttemplates');
  }

  // Active-templates lookup index
  await db.collection('appointmenttemplates').createIndex(
    { clinicId: 1, isActive: 1, type: 1 },
    { background: true, name: 'clinicId_1_isActive_1_type_1' },
  );

  // Unique name per clinic (names must be unique within a clinic)
  await db.collection('appointmenttemplates').createIndex(
    { clinicId: 1, name: 1 },
    { unique: true, background: true, name: 'clinicId_1_name_1_unique' },
  );
}

export async function down(db: Db): Promise<void> {
  // Remove analytics indexes
  await db
    .collection('appointments')
    .dropIndex('clinicId_1_scheduledAt_1_status_1')
    .catch(() => {});
  await db
    .collection('appointments')
    .dropIndex('doctorId_1_clinicId_1_scheduledAt_1_status_1')
    .catch(() => {});
  await db
    .collection('appointments')
    .dropIndex('clinicId_1_isTelemedicine_1_scheduledAt_1')
    .catch(() => {});

  // Remove templates indexes and drop collection
  await db
    .collection('appointmenttemplates')
    .dropIndex('clinicId_1_isActive_1_type_1')
    .catch(() => {});
  await db
    .collection('appointmenttemplates')
    .dropIndex('clinicId_1_name_1_unique')
    .catch(() => {});
  await db.collection('appointmenttemplates').drop().catch(() => {});
}
