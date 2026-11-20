/**
 * Configuration for the automated migration test framework.
 * Consumed by run-migration-tests.ts.
 */

export interface MigrationTestConfig {
  testDatabaseUri: string;
  snapshotBeforeMigration: boolean;
  performanceBudgetMs: number;
  requireRollbackTest: boolean;
  requireIntegrityCheck: boolean;
  destructiveOperationKeywords: string[];
  /**
   * When true, the runner validates that every migration filename starts with a
   * 14-digit timestamp prefix (YYYYMMDDHHmmss_description.ts). Used by the CI
   * check that rejects new migrations without a full timestamp.
   */
  requireTimestampPrefix: boolean;
}

const config: MigrationTestConfig = {
  // Fresh throwaway database used by the CI up/down job. Each run applies all
  // migrations to an empty database and then rolls them back.
  testDatabaseUri: process.env.MIGRATION_TEST_DB_URI || "mongodb://localhost:27017/health_watchers_migration_test",
  snapshotBeforeMigration: true,
  performanceBudgetMs: 5000,
  requireRollbackTest: true,
  requireIntegrityCheck: true,
  destructiveOperationKeywords: ["dropCollection", "dropIndex", "deleteMany", "remove"],
  requireTimestampPrefix: true,
};

export default config;