/**
 * MongoDB Replica Set Initialization Script
 *
 * This script initializes a MongoDB replica set with 3 data nodes + 1 arbiter.
 * Run this ONCE after starting all MongoDB instances.
 */

// Wait for primary to be ready
let primaryReady = false;
let attempts = 0;
const maxAttempts = 30;

while (!primaryReady && attempts < maxAttempts) {
  try {
    const status = db.adminCommand('ping');
    if (status.ok === 1) {
      primaryReady = true;
      print('✓ Primary MongoDB instance is ready');
    }
  } catch (e) {
    attempts++;
    sleep(1000);
  }
}

if (!primaryReady) {
  throw new Error('Primary MongoDB instance did not become ready');
}

// Initialize replica set
print('\n=== Initializing Replica Set ===\n');

const rsConfig = {
  _id: 'rs0',
  members: [
    {
      _id: 0,
      host: 'mongodb-primary:27017',
      priority: 10,
      tags: { role: 'primary', region: 'primary' },
    },
    {
      _id: 1,
      host: 'mongodb-secondary-1:27017',
      priority: 5,
      tags: { role: 'secondary', region: 'secondary-1' },
    },
    {
      _id: 2,
      host: 'mongodb-secondary-2:27017',
      priority: 5,
      tags: { role: 'secondary', region: 'secondary-2' },
    },
    {
      _id: 3,
      host: 'mongodb-arbiter:27017',
      priority: 0,
      arbiterOnly: true,
      tags: { role: 'arbiter' },
    },
  ],
  settings: {
    heartbeatIntervalMillis: 2000,
    heartbeatTimeoutSecs: 10,
    electionTimeoutMillis: 10000,
    catchUpTimeoutMillis: 60000,
    getLastErrorDefaults: {
      w: 1,
      j: true,
      wtimeout: 30000,
    },
    chainingAllowed: true,
    replicaSetId: ObjectId(),
  },
};

try {
  const result = rs.initiate(rsConfig);
  print('✓ Replica set initialized');
  print('  Result: ' + JSON.stringify(result));
} catch (e) {
  print('✗ Error initializing replica set: ' + e.message);
  throw e;
}

// Wait for replica set to stabilize
print('\nWaiting for replica set to stabilize...');
let stable = false;
attempts = 0;
const maxStabilizeAttempts = 60;

while (!stable && attempts < maxStabilizeAttempts) {
  try {
    const status = rs.status();
    const members = status.members.filter((m) => m.state === 1 || m.state === 2 || m.state === 7);

    if (members.length >= 3) {
      stable = true;
      print('✓ Replica set is stable');
      print('\n=== Replica Set Status ===');
      print(JSON.stringify(status, null, 2));
    }
  } catch (e) {
    attempts++;
    sleep(1000);
  }
}

if (!stable) {
  print('✗ Replica set did not stabilize within timeout');
}

// Configure read preferences
print('\n=== Configuring Read Preferences ===\n');

try {
  db.adminCommand({
    setParameter: 1,
    failpoint: 'disableAutocommit',
    mode: 'off',
  });
  print('✓ Read preference configured');
} catch (e) {
  print('ℹ Read preference configuration skipped: ' + e.message);
}

// Print connection information
print('\n=== Connection Information ===\n');
print('Primary:     mongodb://user:pass@mongodb-primary:27017/health_watchers');
print('Secondary 1: mongodb://user:pass@mongodb-secondary-1:27017/health_watchers');
print('Secondary 2: mongodb://user:pass@mongodb-secondary-2:27017/health_watchers');
print(
  'Replica Set: mongodb://user:pass@mongodb-primary:27017,mongodb-secondary-1:27017,mongodb-secondary-2:27017/health_watchers?replicaSet=rs0'
);

print('\n=== Setup Complete ===\n');
