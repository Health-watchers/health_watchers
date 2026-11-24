/**
 * Integration test database helpers.
 *
 * Each test file starts its own in-process MongoDB (mongodb-memory-server) so
 * files can run in parallel across Jest workers without sharing data. The
 * binary is cached at ~/.cache/mongodb-binaries, so no network is needed.
 */
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

export interface TestDb {
  mongod: MongoMemoryServer;
  uri: string;
}

/** Start an in-memory MongoDB and connect Mongoose to it. */
export async function startTestDb(): Promise<TestDb> {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  return { mongod, uri: mongod.getUri() };
}

/** Disconnect Mongoose and stop the in-memory MongoDB server. */
export async function stopTestDb(testDb: TestDb): Promise<void> {
  await mongoose.disconnect();
  await testDb.mongod.stop();
}

export interface ReplSetTestDb {
  replSet: MongoMemoryReplSet;
  uri: string;
}

/**
 * Start a single-node in-memory replica set and connect Mongoose to it.
 *
 * A standalone mongod rejects multi-document transactions, so any suite that
 * exercises `session.withTransaction` (patient merge, payment confirmation,
 * invoice numbering) must use this instead of `startTestDb`. WiredTiger is
 * required because the in-memory storage engine does not support transactions.
 */
export async function startReplSetTestDb(): Promise<ReplSetTestDb> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await replSet.waitUntilRunning();
  const uri = replSet.getUri();
  await mongoose.connect(uri);
  return { replSet, uri };
}

/** Disconnect Mongoose and stop the in-memory replica set. */
export async function stopReplSetTestDb(testDb: ReplSetTestDb): Promise<void> {
  await mongoose.disconnect();
  await testDb.replSet.stop();
}

/**
 * Remove every document from every collection. Run in `afterEach` for full
 * isolation between tests within a file.
 */
export async function clearDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
