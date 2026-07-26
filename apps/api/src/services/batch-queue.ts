import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import logger from '@api/utils/logger';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export interface ExportJobData {
  type: 'patient' | 'clinic' | 'research' | 'payment' | 'report';
  userId: string;
  clinicId: string;
  format: 'json' | 'csv' | 'xlsx' | 'pdf' | 'zip';
  options?: {
    patientId?: string;
    dateFrom?: string;
    dateTo?: string;
    groupBy?: string;
    filters?: Record<string, any>;
  };
}

export interface ExportJobResult {
  jobId: string;
  filePath?: string;
  downloadUrl?: string;
  recordCount: number;
  fileSize: number;
  processingTimeMs: number;
}

export interface BatchProgress {
  total: number;
  processed: number;
  percentage: number;
  estimatedTimeRemainingMs: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error?: string;
}

const exportQueue = new Queue('export-jobs', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

const progressMap = new Map<string, BatchProgress>();

export const exportWorker = new Worker(
  'export-jobs',
  async (job: Job<ExportJobData>) => {
    const startTime = Date.now();
    logger.info({ jobId: job.id, type: job.data.type }, 'Starting export job');

    progressMap.set(job.id!, {
      total: 0,
      processed: 0,
      percentage: 0,
      estimatedTimeRemainingMs: 0,
      status: 'processing',
    });

    try {
      let result: ExportJobResult;

      switch (job.data.type) {
        case 'patient':
          result = await processPatientExport(job);
          break;
        case 'clinic':
          result = await processClinicExport(job);
          break;
        case 'research':
          result = await processResearchExport(job);
          break;
        case 'payment':
          result = await processPaymentExport(job);
          break;
        case 'report':
          result = await processReportExport(job);
          break;
        default:
          throw new Error(`Unknown export type: ${job.data.type}`);
      }

      progressMap.set(job.id!, {
        ...progressMap.get(job.id!)!,
        processed: result.recordCount,
        percentage: 100,
        status: 'completed',
        estimatedTimeRemainingMs: 0,
      });

      logger.info(
        {
          jobId: job.id,
          type: job.data.type,
          recordCount: result.recordCount,
          processingTimeMs: Date.now() - startTime,
        },
        'Export job completed'
      );

      return result;
    } catch (error) {
      progressMap.set(job.id!, {
        ...progressMap.get(job.id!)!,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      logger.error({ jobId: job.id, error }, 'Export job failed');
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 60000,
    },
  }
);

exportWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Export job completed successfully');
});

exportWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Export job failed');
});

export async function addExportJob(data: ExportJobData): Promise<string> {
  const job = await exportQueue.add('export', data, {
    priority: data.type === 'patient' ? 1 : data.type === 'clinic' ? 2 : 3,
  });

  progressMap.set(job.id!, {
    total: 0,
    processed: 0,
    percentage: 0,
    estimatedTimeRemainingMs: 0,
    status: 'queued',
  });

  return job.id!;
}

export function getJobProgress(jobId: string): BatchProgress | undefined {
  return progressMap.get(jobId);
}

export function updateJobProgress(
  jobId: string,
  progress: Partial<BatchProgress>
): void {
  const current = progressMap.get(jobId);
  if (current) {
    progressMap.set(jobId, { ...current, ...progress });
  }
}

export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    exportQueue.getWaitingCount(),
    exportQueue.getActiveCount(),
    exportQueue.getCompletedCount(),
    exportQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

export { exportQueue, progressMap };
