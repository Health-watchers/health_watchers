import { Response } from 'express';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { UserModel } from '@api/modules/auth/models/user.model';
import { Types } from 'mongoose';
import logger from '@api/utils/logger';
import { updateJobProgress, BatchProgress } from '@api/services/batch-queue';
import { StreamingCsvGenerator, streamFromCursor } from '@api/utils/streaming-csv';
import { anonymizeBatch } from '@health-watchers/anonymize';

const BATCH_SIZE = 1000;

export interface StreamingExportOptions {
  jobId: string;
  clinicId: string;
  format: 'json' | 'csv' | 'xlsx';
  dateFrom?: Date;
  dateTo?: Date;
}

function sanitize(doc: Record<string, any>): Record<string, any> {
  const { _id, __v, password, mfaSecret, resetPasswordTokenHash, resetPasswordExpiresAt, ...safe } =
    doc;
  return safe;
}

async function estimateTotalRecords(
  type: string,
  clinicId: string,
  options?: StreamingExportOptions
): Promise<number> {
  const filter: Record<string, any> = {};

  switch (type) {
    case 'patients':
      filter.clinicId = clinicId;
      break;
    case 'encounters':
      const patientIds = await PatientModel.find({ clinicId })
        .select('_id')
        .lean()
        .then((docs) => docs.map((d) => d._id));
      filter.patientId = { $in: patientIds };
      break;
    case 'payments':
      filter.clinicId = clinicId;
      break;
  }

  if (options?.dateFrom || options?.dateTo) {
    filter.createdAt = {};
    if (options.dateFrom) filter.createdAt.$gte = options.dateFrom;
    if (options.dateTo) filter.createdAt.$lte = options.dateTo;
  }

  const model =
    type === 'patients'
      ? PatientModel
      : type === 'encounters'
        ? EncounterModel
        : PaymentRecordModel;

  return model.countDocuments(filter);
}

export async function streamPatientExport(
  res: Response,
  options: StreamingExportOptions
): Promise<void> {
  const { jobId, clinicId, format } = options;

  try {
    const totalRecords = await estimateTotalRecords('patients', clinicId, options);
    updateJobProgress(jobId, { total: totalRecords, status: 'processing' });

    const filter: Record<string, any> = { clinicId };
    if (options.dateFrom || options.dateTo) {
      filter.createdAt = {};
      if (options.dateFrom) filter.createdAt.$gte = options.dateFrom;
      if (options.dateTo) filter.createdAt.$lte = options.dateTo;
    }

    const cursor = PatientModel.find(filter).lean().cursor();

    if (format === 'csv') {
      const headers = [
        'systemId', 'firstName', 'lastName', 'dateOfBirth', 'sex',
        'contactNumber', 'address', 'isActive', 'createdAt'
      ];

      const csvGenerator = new StreamingCsvGenerator({ headers });
      const transform = csvGenerator.createTransformStream();

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="patients-export.csv"`);
      res.setHeader('Transfer-Encoding', 'chunked');

      transform.pipe(res);

      let processed = 0;
      for await (const doc of cursor) {
        const sanitized = sanitize(doc as Record<string, any>);
        transform.write([sanitized]);

        processed++;
        if (processed % 100 === 0) {
          updateJobProgress(jobId, {
            processed,
            percentage: Math.round((processed / totalRecords) * 100),
            estimatedTimeRemainingMs: 0,
          });
        }
      }

      transform.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="patients-export.json"`);
      res.setHeader('Transfer-Encoding', 'chunked');

      res.write('[\n');

      let processed = 0;
      let first = true;

      for await (const doc of cursor) {
        const sanitized = sanitize(doc as Record<string, any>);

        if (!first) {
          res.write(',\n');
        }
        res.write(JSON.stringify(sanitized, null, 2));
        first = false;

        processed++;
        if (processed % 100 === 0) {
          updateJobProgress(jobId, {
            processed,
            percentage: Math.round((processed / totalRecords) * 100),
            estimatedTimeRemainingMs: 0,
          });
        }
      }

      res.write('\n]');
    }

    updateJobProgress(jobId, {
      processed: totalRecords,
      percentage: 100,
      status: 'completed',
    });

    res.end();
  } catch (error) {
    logger.error({ jobId, error }, 'Patient export failed');
    updateJobProgress(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Export failed' });
  }
}

export async function streamPaymentExport(
  res: Response,
  options: StreamingExportOptions
): Promise<void> {
  const { jobId, clinicId, format } = options;

  try {
    const totalRecords = await estimateTotalRecords('payments', clinicId, options);
    updateJobProgress(jobId, { total: totalRecords, status: 'processing' });

    const filter: Record<string, any> = { clinicId };
    if (options.dateFrom || options.dateTo) {
      filter.createdAt = {};
      if (options.dateFrom) filter.createdAt.$gte = options.dateFrom;
      if (options.dateTo) filter.createdAt.$lte = options.dateTo;
    }

    const cursor = PaymentRecordModel.find(filter).lean().cursor();

    if (format === 'csv') {
      const headers = [
        'id', 'amount', 'assetCode', 'status', 'fromAddress', 'toAddress',
        'memo', 'txHash', 'createdAt'
      ];

      const csvGenerator = new StreamingCsvGenerator({ headers });
      const transform = csvGenerator.createTransformStream();

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="payments-export.csv"`);
      res.setHeader('Transfer-Encoding', 'chunked');

      transform.pipe(res);

      let processed = 0;
      for await (const doc of cursor) {
        const sanitized = sanitize(doc as Record<string, any>);
        transform.write([sanitized]);

        processed++;
        if (processed % 100 === 0) {
          updateJobProgress(jobId, {
            processed,
            percentage: Math.round((processed / totalRecords) * 100),
            estimatedTimeRemainingMs: 0,
          });
        }
      }

      transform.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="payments-export.json"`);
      res.setHeader('Transfer-Encoding', 'chunked');

      res.write('[\n');

      let processed = 0;
      let first = true;

      for await (const doc of cursor) {
        const sanitized = sanitize(doc as Record<string, any>);

        if (!first) {
          res.write(',\n');
        }
        res.write(JSON.stringify(sanitized, null, 2));
        first = false;

        processed++;
        if (processed % 100 === 0) {
          updateJobProgress(jobId, {
            processed,
            percentage: Math.round((processed / totalRecords) * 100),
            estimatedTimeRemainingMs: 0,
          });
        }
      }

      res.write('\n]');
    }

    updateJobProgress(jobId, {
      processed: totalRecords,
      percentage: 100,
      status: 'completed',
    });

    res.end();
  } catch (error) {
    logger.error({ jobId, error }, 'Payment export failed');
    updateJobProgress(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Export failed' });
  }
}

export async function streamResearchExport(
  res: Response,
  options: { jobId: string }
): Promise<void> {
  const { jobId } = options;

  try {
    const totalRecords = await PatientModel.countDocuments();
    updateJobProgress(jobId, { total: totalRecords, status: 'processing' });

    const cursor = PatientModel.find().lean().cursor();
    const batchSize = 500;
    let processed = 0;
    let batch: any[] = [];

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="research-export.json"`);
    res.setHeader('Transfer-Encoding', 'chunked');

    res.write('{\n  "status": "success",\n  "exportedAt": "' + new Date().toISOString() + '",\n  "data": [\n');

    let first = true;

    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= batchSize) {
        const anonymized = anonymizeBatch(batch, {
          level: 'aggregation',
          purpose: 'research',
        });

        for (const item of anonymized) {
          if (!first) {
            res.write(',\n');
          }
          res.write('    ' + JSON.stringify(item));
          first = false;
        }

        processed += batch.length;
        batch = [];

        updateJobProgress(jobId, {
          processed,
          percentage: Math.round((processed / totalRecords) * 100),
          estimatedTimeRemainingMs: 0,
        });
      }
    }

    if (batch.length > 0) {
      const anonymized = anonymizeBatch(batch, {
        level: 'aggregation',
        purpose: 'research',
      });

      for (const item of anonymized) {
        if (!first) {
          res.write(',\n');
        }
        res.write('    ' + JSON.stringify(item));
        first = false;
      }

      processed += batch.length;
    }

    res.write('\n  ]\n}');

    updateJobProgress(jobId, {
      processed: totalRecords,
      percentage: 100,
      status: 'completed',
    });

    res.end();
  } catch (error) {
    logger.error({ jobId, error }, 'Research export failed');
    updateJobProgress(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Export failed' });
  }
}
