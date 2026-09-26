/**
 * Integration test database helpers.
 *
 * Each test file starts its own in-process MongoDB (mongodb-memory-server) so
 * files can run in parallel across Jest workers without sharing data. The
 * binary is cached at ~/.cache/mongodb-binaries, so no network is needed.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
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

/**
 * Remove every document from every collection. Run in `afterEach` for full
 * isolation between tests within a file.
 */
export async function clearDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
