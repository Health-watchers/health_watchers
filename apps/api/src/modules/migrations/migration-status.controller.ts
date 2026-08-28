import { Router, Request, Response } from 'express';
import { migrationManager } from '../../services/migration-manager.service';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import logger from '../../utils/logger';

const router = Router();

router.get('/migrations/status', requireAuth, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const history = await migrationManager.getMigrationHistory(10);

    const stats = {
      totalMigrations: history.length,
      successful: history.filter((m) => m.status === 'success').length,
      failed: history.filter((m) => m.status === 'failed').length,
      rolledBack: history.filter((m) => m.status === 'rolled_back').length,
      totalDuration: history.reduce((sum, m) => sum + m.duration, 0),
      averageDuration: history.length > 0 ? Math.round(history.reduce((sum, m) => sum + m.duration, 0) / history.length) : 0,
    };

    res.json({
      stats,
      recentMigrations: history,
    });
  } catch (err) {
    logger.error({ err }, '[migration-status] Failed to fetch status');
    res.status(500).json({ error: 'Failed to fetch migration status' });
  }
});

router.get('/migrations/latest', requireAuth, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const latest = await migrationManager.getLatestMigration();
    res.json({ migration: latest });
  } catch (err) {
    logger.error({ err }, '[migration-status] Failed to fetch latest migration');
    res.status(500).json({ error: 'Failed to fetch latest migration' });
  }
});

export const migrationStatusRouter = router;
