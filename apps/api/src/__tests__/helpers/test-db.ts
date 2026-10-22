/**
 * Per-test database isolation helpers using mongodb-memory-server
 *
 * Usage in tests:
 *   import { setupTestDB, teardownTestDB } from '@api/__tests__/helpers/test-db';
 *
 *   beforeAll(async () => {
 *     await setupTestDB();
 *   });
 *
 *   afterAll(async () => {
 *     await teardownTestDB();
 *   });
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | null = null;

/**
 * Start an in-memory MongoDB instance and connect Mongoose.
 * Each test file gets its own isolated database.
 */
export async function setupTestDB(): Promise<void> {
  if (mongod) {
    throw new Error('Test DB already setup. Call teardownTestDB() first.');
  }

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
}

/**
 * Disconnect Mongoose and stop the in-memory MongoDB instance.
 */
export async function teardownTestDB(): Promise<void> {
  if (!mongod) {
    return;
  }

  await mongoose.disconnect();
  await mongod.stop();
  mongod = null;
}

/**
 * Clear all collections in the test database.
 * Useful in afterEach() to reset state between tests.
 */
export async function clearTestDB(): Promise<void> {
  if (!mongoose.connection.db) {
    return;
  }

  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

/**
 * Get the connection URI of the test database.
 * Useful for debugging or external tool connections.
 */
export function getTestDBUri(): string {
  if (!mongod) {
    throw new Error('Test DB not setup. Call setupTestDB() first.');
  }
  return mongod.getUri();
}
