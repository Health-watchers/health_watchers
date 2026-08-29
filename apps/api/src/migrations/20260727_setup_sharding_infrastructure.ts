import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Create a sharding metadata collection to track shard assignments
  await db.createCollection('sharding_metadata');

  // Create indexes for shard metadata
  await db
    .collection('sharding_metadata')
    .createIndex({ collectionName: 1, shardKey: 1 }, { unique: true });
  await db
    .collection('sharding_metadata')
    .createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

  // Create shard statistics collection
  await db.createCollection('shard_statistics');

  await db
    .collection('shard_statistics')
    .createIndex({ collectionName: 1, shardName: 1, timestamp: -1 });

  // Create shard health check collection
  await db.createCollection('shard_health_checks');

  await db.collection('shard_health_checks').createIndex({ shardName: 1, timestamp: -1 });
  await db
    .collection('shard_health_checks')
    .createIndex({ timestamp: 1 }, { expireAfterSeconds: 604800 }); // 7 days

  // Create chunk migration tracking collection
  await db.createCollection('chunk_migrations');

  await db
    .collection('chunk_migrations')
    .createIndex({ collectionName: 1, status: 1, createdAt: -1 });
  await db.collection('chunk_migrations').createIndex({ sourceShardId: 1, destinationShardId: 1 });

  // Create indexes on existing collections to support sharding
  // These would be called after sharding is enabled

  // Example indexes for Encounters
  // await db.collection('encounters').createIndex({ clinicId: 1 });

  // Example indexes for Patients
  // await db.collection('patients').createIndex({ clinicId: 1 });

  // Example indexes for CommunicationLogs
  // await db.collection('communicationlogs').createIndex({ createdAt: 1 });

  console.log('Sharding infrastructure created successfully');
}

export async function down(db: Db): Promise<void> {
  try {
    await db.collection('sharding_metadata').drop();
  } catch (e) {
    // Collection might not exist
  }

  try {
    await db.collection('shard_statistics').drop();
  } catch (e) {
    // Collection might not exist
  }

  try {
    await db.collection('shard_health_checks').drop();
  } catch (e) {
    // Collection might not exist
  }

  try {
    await db.collection('chunk_migrations').drop();
  } catch (e) {
    // Collection might not exist
  }

  console.log('Sharding infrastructure removed');
}
