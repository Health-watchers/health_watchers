// migrate-mongo configuration
// See: https://github.com/seppevs/migrate-mongo#configuration
'use strict';

const dbName = process.env.MONGO_URI
  ? new URL(process.env.MONGO_URI).pathname.replace('/', '')
  : 'health_watchers';

module.exports = {
  mongodb: {
    url: process.env.MONGO_URI || 'mongodb://localhost:27017/health_watchers',
    databaseName: dbName,
    options: {
      // No deprecated options needed for mongoose 8 / MongoDB driver 6
    },
  },
  migrationsDir: 'src/migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.ts',
  // Use ts-node so TypeScript migrations run directly
  moduleSystem: 'commonjs',
};
