import { Request, Response } from 'express';
import { addExportJob, getJobProgress } from '@api/services/batch-queue';
import { streamProgress } from '@api/services/progress-tracker';
import { streamPatientExport, streamPaymentExport, streamResearchExport } from '@api/services/streaming-export';
import logger from '@api/utils/logger';

export class BatchExportController {
  async startExport(req: Request, res: Response): Promise<void> {
    try {
      const { type, format, dateFrom, dateTo } = req.body;
      const userId = req.user?.id;
      const clinicId = req.user?.clinicId;

      if (!userId || !clinicId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const jobId = await addExportJob({
        type,
        userId,
        clinicId,
        format: format || 'json',
        options: {
          dateFrom,
          dateTo,
        },
      });

      res.status(202).json({
        status: 'accepted',
        jobId,
        message: 'Export job started. Use the jobId to track progress.',
        progressUrl: `/api/v1/exports/progress/${jobId}`,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to start export job');
      res.status(500).json({ error: 'Failed to start export job' });
    }
  }

  async streamExport(req: Request, res: Response): Promise<void> {
    try {
      const { type, format } = req.params;
      const userId = req.user?.id;
      const clinicId = req.user?.clinicId;

      if (!userId || !clinicId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const jobId = `direct-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const { addExportJob: addJob, updateJobProgress } = await import('@api/services/batch-queue');
      await addJob({
        type: type as any,
        userId,
        clinicId,
        format: format as any,
      });

      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

      switch (type) {
        case 'patient':
          await streamPatientExport(res, { jobId, clinicId, format: format as any, dateFrom, dateTo });
          break;
        case 'payment':
          await streamPaymentExport(res, { jobId, clinicId, format: format as any, dateFrom, dateTo });
          break;
        case 'research':
          await streamResearchExport(res, { jobId });
          break;
        default:
          res.status(400).json({ error: 'Invalid export type' });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to stream export');
      res.status(500).json({ error: 'Export failed' });
    }
  }

  async getProgress(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const progress = getJobProgress(jobId);

    if (!progress) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ jobId, progress });
  }

  async streamProgressSSE(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    streamProgress(jobId, res);
  }
}

export const batchExportController = new BatchExportController();
