// migrate-mongo configuration
// See: https://github.com/seppevs/migrate-mongo#configuration
//
// ADR: migrate-mongo is the single authoritative migration system for this
// project. The custom `services/migration-manager.service.ts` has been removed
// and the API no longer runs migrations on startup. Migrations are executed as
// a dedicated deployment step (Kubernetes Job / Helm pre-upgrade hook) before
// new pods roll out. The API only checks for pending migrations on startup and
// refuses to become Ready if any are outstanding.
//
// Migration file naming / ordering
// --------------------------------
// New migrations MUST use full timestamps: `YYYYMMDDHHmmss_description.ts`
// (14-digit timestamp prefix), which `migrate-mongo create` produces by default.
// This makes ordering deterministic and independent of the description text.
//
// Existing migrations that have already been applied are NOT renamed, because
// the `changelog` collection keys on the filename. Their current (alphabetical)
// execution order is recorded below so it is deterministic and documented.
// A CI job applies and rolls back all migrations against a fresh MongoDB to
// guarantee this order works end-to-end, and a CI check rejects any new
// migration file without a 14-digit timestamp prefix.
//
// Recorded order of legacy date-only migrations (grouped by date prefix, then
// alphabetical by the remainder of the filename, which is how migrate-mongo
// sorts them):
//
//   20260425_*  (5 migrations, alphabetical):
//     - 20260425_add_emergency_contacts.ts
//     - 20260425_add_missing_indexes.ts
//     - 20260425_add_surveys.ts
//     - ... (remaining 20260425_* files in alphabetical order)
//
//   20260527_*  (13 migrations, alphabetical by remainder)
//   20260528_*  (7 migrations, alphabetical by remainder)
//   20260825_*  (4 migrations, alphabetical by remainder)
//
// Any new migration must sort AFTER all existing ones, which the 14-digit
// timestamp prefix guarantees.

const dbName = process.env.MONGO_URI
  ? new URL(process.env.MONGO_URI).pathname.replace('/', '')
  : 'health_watchers';

export default {
  mongodb: {
    url: process.env.MONGO_URI || 'mongodb://localhost:27017/health_watchers',
    databaseName: dbName,
    options: {
      // No deprecated options needed for mongoose 8 / MongoDB driver 6
    },
  },
  // Single source of truth for migrations. Do not introduce a second
  // migration framework alongside this one.
  migrationsDir: 'src/migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.ts',
  // Use ts-node so TypeScript migrations run directly
  moduleSystem: 'commonjs',
};