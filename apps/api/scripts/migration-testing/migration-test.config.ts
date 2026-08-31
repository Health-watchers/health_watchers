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
}

const config: MigrationTestConfig = {
  testDatabaseUri: process.env.MIGRATION_TEST_DB_URI || "mongodb://localhost:27017/health_watchers_migration_test",
  snapshotBeforeMigration: true,
  performanceBudgetMs: 5000,
  requireRollbackTest: true,
  requireIntegrityCheck: true,
  destructiveOperationKeywords: ["dropCollection", "dropIndex", "deleteMany", "remove"],
};

export default config;
