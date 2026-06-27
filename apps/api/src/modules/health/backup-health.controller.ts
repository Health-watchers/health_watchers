import { Router, Request, Response } from 'express';
import {
  getBackupVerificationStatus,
  isBackupVerificationStale,
} from '../../services/backup-metrics.service';
import logger from '../../utils/logger';

const router = Router();

/**
 * GET /health/backup - Backup verification health check
 * Returns the status of the last backup verification
 * Used by monitoring systems to alert on stale or failed verifications
 */
router.get('/backup', (req: Request, res: Response) => {
  const status = getBackupVerificationStatus();
  const isStale = isBackupVerificationStale(8);

  // Determine overall health status
  let httpStatus = 200;
  let healthStatus = 'healthy';

  if (status.status === 'failure') {
    httpStatus = 503;
    healthStatus = 'unhealthy';
  } else if (isStale) {
    httpStatus = 503;
    healthStatus = 'degraded';
  }

  const response = {
    status: healthStatus,
    backup: {
      lastVerified: status.lastVerified?.toISOString() || null,
      verificationStatus: status.status,
      isStale,
      daysSinceVerification: status.daysSinceVerification,
      staleSinceThreshold: 8,
    },
    timestamp: new Date().toISOString(),
  };

  logger.debug({ backup: response.backup }, 'Backup health check');

  res.status(httpStatus).json(response);
});

/**
 * GET /health/backup/detailed - Detailed backup verification status
 * Includes metrics and recommendations
 */
router.get('/backup/detailed', (req: Request, res: Response) => {
  const status = getBackupVerificationStatus();
  const isStale = isBackupVerificationStale(8);

  let recommendations: string[] = [];

  if (status.status === 'unknown') {
    recommendations.push(
      'Backup verification has never run. Ensure the backup-verify.yml workflow is configured.'
    );
  }

  if (status.status === 'failure') {
    recommendations.push(
      'Last backup verification failed. Investigate the backup integrity immediately.'
    );
    recommendations.push('Check the backup-verify.yml workflow logs for details.');
    recommendations.push('Consider running a manual backup if needed.');
  }

  if (isStale) {
    recommendations.push(
      'Backup verification is stale (>8 days). Check if the weekly schedule is working.'
    );
    recommendations.push('Verify that the backup-verify.yml workflow is enabled and running.');
  }

  if (status.status === 'success' && !isStale) {
    recommendations.push('Backup verification is healthy. No action required.');
  }

  const response = {
    status: status.status === 'failure' || isStale ? 'degraded' : 'healthy',
    backup: {
      lastVerified: status.lastVerified?.toISOString() || null,
      verificationStatus: status.status,
      isStale,
      daysSinceVerification: status.daysSinceVerification,
      staleSinceThreshold: 8,
    },
    recommendations,
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(response);
});

export { router as backupHealthRoutes };
