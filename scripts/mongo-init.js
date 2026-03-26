// MongoDB initialization script for Docker
// This script runs when the MongoDB container first starts

db = db.getSiblingDB('health_watchers');

// Create collections
db.createCollection('users');
db.createCollection('patients');
db.createCollection('encounters');
db.createCollection('payments');

// Create indexes for better query performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });

db.patients.createIndex({ patientId: 1 }, { unique: true });
db.patients.createIndex({ email: 1 });
db.patients.createIndex({ createdAt: -1 });

db.encounters.createIndex({ patientId: 1 });
db.encounters.createIndex({ encounterDate: -1 });
db.encounters.createIndex({ createdAt: -1 });

db.payments.createIndex({ patientId: 1 });
db.payments.createIndex({ transactionHash: 1 }, { unique: true, sparse: true });
db.payments.createIndex({ status: 1 });
db.payments.createIndex({ createdAt: -1 });

print('MongoDB initialization complete for health_watchers database');
