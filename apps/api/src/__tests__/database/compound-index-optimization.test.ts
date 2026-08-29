/**
 * Tests for the 20260825_compound_index_optimization migration (Issue #1067).
 *
 * Verifies all compound indexes are created correctly, are idempotent,
 * and are properly rolled back by the down() function.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import * as migration from '@api/migrations/20260825_compound_index_optimization';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db('test');
});

afterAll(async () => {
  await client.close();
  await mongod.stop();
});

afterEach(async () => {
  const cols = await db.listCollections().toArray();
  for (const col of cols) {
    await db.collection(col.name).drop().catch(() => {});
  }
});

describe('20260825_compound_index_optimization', () => {
  // ── Notifications ─────────────────────────────────────────────────────────
  describe('notifications indexes', () => {
    it('creates notifications_clinicId_userId_isRead index', async () => {
      await migration.up(db);
      const indexes = await db.collection('notifications').indexInformation();
      expect(indexes['notifications_clinicId_userId_isRead']).toBeDefined();
    });

    it('creates notifications_clinicId_createdAt index', async () => {
      await migration.up(db);
      const indexes = await db.collection('notifications').indexInformation();
      expect(indexes['notifications_clinicId_createdAt']).toBeDefined();
    });

    it('creates notifications_userId_isRead_createdAt index', async () => {
      await migration.up(db);
      const indexes = await db.collection('notifications').indexInformation();
      expect(indexes['notifications_userId_isRead_createdAt']).toBeDefined();
    });
  });

  // ── Audit Logs ────────────────────────────────────────────────────────────
  describe('auditlogs indexes', () => {
    it('creates auditlogs_clinicId_userId_createdAt index', async () => {
      await migration.up(db);
      const indexes = await db.collection('auditlogs').indexInformation();
      expect(indexes['auditlogs_clinicId_userId_createdAt']).toBeDefined();
    });

    it('creates auditlogs_clinicId_resourceType_createdAt index', async () => {
      await migration.up(db);
      const indexes = await db.collection('auditlogs').indexInformation();
      expect(indexes['auditlogs_clinicId_resourceType_createdAt']).toBeDefined();
    });

    it('creates auditlogs_clinicId_action_createdAt index', async () => {
      await migration.up(db);
      const indexes = await db.collection('auditlogs').indexInformation();
      expect(indexes['auditlogs_clinicId_action_createdAt']).toBeDefined();
    });
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  describe('users indexes', () => {
    it('creates users_clinicId_isActive_role index', async () => {
      await migration.up(db);
      const indexes = await db.collection('users').indexInformation();
      expect(indexes['users_clinicId_isActive_role']).toBeDefined();
    });

    it('creates users_clinicId_fullName index', async () => {
      await migration.up(db);
      const indexes = await db.collection('users').indexInformation();
      expect(indexes['users_clinicId_fullName']).toBeDefined();
    });
  });

  // ── Encounters ────────────────────────────────────────────────────────────
  describe('encounters indexes', () => {
    it('creates encounters_attendingDoctorId_status_createdAt index', async () => {
      await migration.up(db);
      const indexes = await db.collection('encounters').indexInformation();
      expect(indexes['encounters_attendingDoctorId_status_createdAt']).toBeDefined();
    });
  });

  // ── Payment Records ───────────────────────────────────────────────────────
  describe('paymentrecords indexes', () => {
    it('creates paymentrecords_clinicId_patientId_status index', async () => {
      await migration.up(db);
      const indexes = await db.collection('paymentrecords').indexInformation();
      expect(indexes['paymentrecords_clinicId_patientId_status']).toBeDefined();
    });

    it('creates paymentrecords_clinicId_encounterId index', async () => {
      await migration.up(db);
      const indexes = await db.collection('paymentrecords').indexInformation();
      expect(indexes['paymentrecords_clinicId_encounterId']).toBeDefined();
    });
  });

  // ── Idempotency ───────────────────────────────────────────────────────────
  describe('idempotency', () => {
    it('up() is safe to run twice without errors', async () => {
      await migration.up(db);
      await expect(migration.up(db)).resolves.not.toThrow();
    });
  });

  // ── Rollback ─────────────────────────────────────────────────────────────
  describe('down() rollback', () => {
    it('removes all notification indexes', async () => {
      await migration.up(db);
      await migration.down(db);
      const indexes = await db.collection('notifications').indexInformation();
      expect(indexes['notifications_clinicId_userId_isRead']).toBeUndefined();
      expect(indexes['notifications_clinicId_createdAt']).toBeUndefined();
      expect(indexes['notifications_userId_isRead_createdAt']).toBeUndefined();
    });

    it('removes all auditlog indexes', async () => {
      await migration.up(db);
      await migration.down(db);
      const indexes = await db.collection('auditlogs').indexInformation();
      expect(indexes['auditlogs_clinicId_userId_createdAt']).toBeUndefined();
      expect(indexes['auditlogs_clinicId_resourceType_createdAt']).toBeUndefined();
      expect(indexes['auditlogs_clinicId_action_createdAt']).toBeUndefined();
    });

    it('removes all user indexes added by this migration', async () => {
      await migration.up(db);
      await migration.down(db);
      const indexes = await db.collection('users').indexInformation();
      expect(indexes['users_clinicId_isActive_role']).toBeUndefined();
      expect(indexes['users_clinicId_fullName']).toBeUndefined();
    });

    it('removes all encounter indexes added by this migration', async () => {
      await migration.up(db);
      await migration.down(db);
      const indexes = await db.collection('encounters').indexInformation();
      expect(indexes['encounters_attendingDoctorId_status_createdAt']).toBeUndefined();
    });

    it('removes all payment record indexes added by this migration', async () => {
      await migration.up(db);
      await migration.down(db);
      const indexes = await db.collection('paymentrecords').indexInformation();
      expect(indexes['paymentrecords_clinicId_patientId_status']).toBeUndefined();
      expect(indexes['paymentrecords_clinicId_encounterId']).toBeUndefined();
    });

    it('down() is safe to call when indexes do not exist', async () => {
      await expect(migration.down(db)).resolves.not.toThrow();
    });
  });
});
