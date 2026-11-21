import { Router, Request, Response } from 'express';
import { MongoClient, Db } from 'mongodb';
import { config } from '../../config';
import { authenticate as requireAuth } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { requireMfa } from '../../middlewares/mfa.middleware';
import logger from '../../utils/logger';

const router = Router();

// migrate-mongo stores applied migrations in this collection by default.
const CHANGELOG_COLLECTION = 'changelog';

interface ChangelogEntry {
  fileName: string;
  appliedAt: Date;
}

interface PendingMigration {
  fileName: string;
}

let cachedClient: MongoClient | null = null;

async function getDb(): Promise<Db> {
  if (!cachedClient) {
    cachedClient = new MongoClient(config.mongodb.uri);
    await cachedClient.connect();
  }
  return cachedClient.db(config.mongodb.dbName);
}

/**
 * Read the migrate-mongo changelog (applied migrations) and compare it with
 * the migrations directory to determine which migrations are still pending.
 * This mirrors what `migrate-mongo status` reports.
 */
async function getMigrateMongoStatus(): Promise<{
  applied: ChangelogEntry[];
  pending: PendingMigration[];
}> {
  const db = await getDb();
  const applied = await db
    .collection<ChangelogEntry>(CHANGELOG_COLLECTION)
    .find({}, { projection: { fileName: 1, appliedAt: 1, _id: 0 } })
    .sort({ appliedAt: 1 })
    .toArray();

  // Lazy-load the migration files so a missing directory doesn't break the API.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { loadMigrationFiles } = require('migrate-mongo/lib/migrate') as {
    loadMigrationFiles: (dir: string) => Promise<{ fileName: string }[]>;
  };
  const files = await loadMigrationFiles(config.migrations.dir);
  const appliedNames = new Set(applied.map((m) => m.fileName));
  const pending = files
    .filter((f) => !appliedNames.has(f.fileName))
    .map((f) => ({ fileName: f.fileName }));

  return { applied, pending };
}

router.get(
  '/migrations/status',
  requireAuth,
  requirePermission('migrations:read'),
  requireRole('SUPER_ADMIN'),
  requireMfa,
  async (_req: Request, res: Response) => {
    try {
      const { applied, pending } = await getMigrateMongoStatus();

      const stats = {
        totalApplied: applied.length,
        totalPending: pending.length,
        lastAppliedAt: applied.length > 0 ? applied[applied.length - 1].appliedAt : null,
      };

      res.json({
        framework: 'migrate-mongo',
        stats,
        pendingMigrations: pending,
        recentMigrations: applied.slice(-10).reverse(),
      });
    } catch (err) {
      logger.error({ err }, '[migration-status] Failed to fetch status');
      res.status(500).json({ error: 'Failed to fetch migration status' });
    }
  }
);

router.get(
  '/migrations/latest',
  requireAuth,
  requirePermission('migrations:read'),
  requireRole('SUPER_ADMIN'),
  requireMfa,
  async (_req: Request, res: Response) => {
    try {
      const { applied } = await getMigrateMongoStatus();
      const latest = applied.length > 0 ? applied[applied.length - 1] : null;
      res.json({ migration: latest });
    } catch (err) {
      logger.error({ err }, '[migration-status] Failed to fetch latest migration');
      res.status(500).json({ error: 'Failed to fetch latest migration' });
    }
  }
);

export const migrationStatusRouter = router;
