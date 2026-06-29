import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import * as initialSchema from '@api/migrations/20240101_initial_schema';
import * as searchIndex from '@api/migrations/20240102_add_patient_search_index';
import * as encounterStatus from '@api/migrations/20240103_add_encounter_status';
import * as missingIndexes from '@api/migrations/20260425_add_missing_indexes';
import * as dashboardIndexes from '@api/migrations/20260625_dashboard_compound_indexes';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;

async function dropAllCollections() {
  const cols = await db.listCollections().toArray();
  for (const col of cols) {
    await db.collection(col.name).drop().catch(() => {});
  }
}

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
  await dropAllCollections();
});

describe('Migrations', () => {
  describe('20240101_initial_schema', () => {
    it('creates unique index on patients.systemId', async () => {
      await initialSchema.up(db);
      const indexes = await db.collection('patients').indexInformation();
      expect(indexes['systemId_unique']).toBeDefined();
    });

    it('creates index on patients.searchName', async () => {
      await initialSchema.up(db);
      const indexes = await db.collection('patients').indexInformation();
      expect(indexes['searchName_1']).toBeDefined();
    });

    it('creates indexes on encounters collection', async () => {
      await initialSchema.up(db);
      const indexes = await db.collection('encounters').indexInformation();
      expect(indexes['patientId_1']).toBeDefined();
      expect(indexes['clinicId_1']).toBeDefined();
      expect(indexes['status_1']).toBeDefined();
    });

    it('creates unique index on paymentrecords.intentId', async () => {
      await initialSchema.up(db);
      const indexes = await db.collection('paymentrecords').indexInformation();
      expect(indexes['intentId_unique']).toBeDefined();
    });

    it('is idempotent — up() twice does not throw', async () => {
      await initialSchema.up(db);
      await expect(initialSchema.up(db)).resolves.not.toThrow();
    });

    it('removes patient indexes on down()', async () => {
      await initialSchema.up(db);
      await initialSchema.down(db);
      const indexes = await db.collection('patients').indexInformation();
      expect(indexes['systemId_unique']).toBeUndefined();
      expect(indexes['searchName_1']).toBeUndefined();
    });

    it('removes encounter indexes on down()', async () => {
      await initialSchema.up(db);
      await initialSchema.down(db);
      const indexes = await db.collection('encounters').indexInformation();
      expect(indexes['patientId_1']).toBeUndefined();
      expect(indexes['status_1']).toBeUndefined();
    });
  });

  describe('20240102_add_patient_search_index', () => {
    it('adds text index on patients.searchName', async () => {
      await searchIndex.up(db);
      const indexes = await db.collection('patients').indexInformation();
      expect(indexes['searchName_text']).toBeDefined();
    });

    it('removes the text index on down()', async () => {
      await searchIndex.up(db);
      await searchIndex.down(db);
      const indexes = await db.collection('patients').indexInformation();
      expect(indexes['searchName_text']).toBeUndefined();
    });
  });

  describe('20240103_add_encounter_status', () => {
    it('backfills status="open" on encounters missing the field', async () => {
      await db.collection('encounters').insertMany([
        { patientId: 'p1', chiefComplaint: 'Headache' },
        { patientId: 'p2', chiefComplaint: 'Fever', status: 'closed' },
      ]);

      await encounterStatus.up(db);

      const noStatus = await db.collection('encounters').findOne({ patientId: 'p1' });
      const withStatus = await db.collection('encounters').findOne({ patientId: 'p2' });
      expect(noStatus?.status).toBe('open');
      expect(withStatus?.status).toBe('closed');
    });

    it('is idempotent — backfill twice produces the same result', async () => {
      await db.collection('encounters').insertOne({ patientId: 'p1', chiefComplaint: 'Test' });
      await encounterStatus.up(db);
      await encounterStatus.up(db);
      const doc = await db.collection('encounters').findOne({ patientId: 'p1' });
      expect(doc?.status).toBe('open');
    });

    it('does not overwrite an existing non-open status', async () => {
      await db.collection('encounters').insertOne({ patientId: 'p3', status: 'cancelled' });
      await encounterStatus.up(db);
      const doc = await db.collection('encounters').findOne({ patientId: 'p3' });
      expect(doc?.status).toBe('cancelled');
    });
  });

  describe('20260425_add_missing_indexes', () => {
    it('creates compound encounter index clinicId+createdAt', async () => {
      await missingIndexes.up(db);
      const indexes = await db.collection('encounters').indexInformation();
      expect(indexes['clinicId_1_createdAt_-1']).toBeDefined();
    });

    it('creates encounter index on patientId+createdAt', async () => {
      await missingIndexes.up(db);
      const indexes = await db.collection('encounters').indexInformation();
      expect(indexes['patientId_1_createdAt_-1']).toBeDefined();
    });

    it('creates payment index on clinicId+createdAt', async () => {
      await missingIndexes.up(db);
      const indexes = await db.collection('paymentrecords').indexInformation();
      expect(indexes['clinicId_1_createdAt_-1']).toBeDefined();
    });

    it('removes compound indexes on down()', async () => {
      await missingIndexes.up(db);
      await missingIndexes.down(db);
      const encounterIndexes = await db.collection('encounters').indexInformation();
      const paymentIndexes = await db.collection('paymentrecords').indexInformation();
      expect(encounterIndexes['clinicId_1_createdAt_-1']).toBeUndefined();
      expect(paymentIndexes['clinicId_1_createdAt_-1']).toBeUndefined();
    });
  });

  describe('20260625_dashboard_compound_indexes', () => {
    it('creates patients compound index for dashboard queries', async () => {
      await dashboardIndexes.up(db);
      const indexes = await db.collection('patients').indexInformation();
      expect(indexes['clinicId_1_createdAt_-1']).toBeDefined();
    });

    it('creates payment status+date index for pending payment queries', async () => {
      await dashboardIndexes.up(db);
      const indexes = await db.collection('paymentrecords').indexInformation();
      expect(indexes['clinicId_1_status_1_createdAt_-1']).toBeDefined();
    });

    it('is idempotent — up() twice does not throw', async () => {
      await dashboardIndexes.up(db);
      await expect(dashboardIndexes.up(db)).resolves.not.toThrow();
    });
  });
});
