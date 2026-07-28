import { Request, Response } from 'express';
import archiveService from './archive.service';
import { getPolicyForCollection } from './archive-policies';
import { asyncHandler } from '../../utils/asyncHandler';
import { z } from 'zod';

const retrieveArchivedRecordsSchema = z.object({
  collectionName: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const restoreArchivedRecordSchema = z.object({
  archiveId: z.string().min(1),
});

export const getArchivedRecords = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const params = retrieveArchivedRecordsSchema.parse(req.query);

  const result = await archiveService.retrieveArchivedRecords(
    clinicId.toString(),
    params.collectionName,
    params.limit,
    params.offset
  );

  return res.status(200).json(result);
});

export const restoreArchivedRecord = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;
  const userId = req.user?.id;

  if (!clinicId || !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { archiveId } = restoreArchivedRecordSchema.parse(req.body);

  const restored = await archiveService.restoreArchivedRecord(archiveId, clinicId.toString(), userId);

  return res.status(200).json({
    message: 'Record restored successfully',
    archive: restored,
  });
});

export const getArchiveStats = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stats = await archiveService.getArchiveStats(clinicId.toString());

  return res.status(200).json(stats);
});

export const triggerArchival = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;
  const userId = req.user?.id;

  if (!clinicId || !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { collectionName } = z.object({ collectionName: z.string().min(1) }).parse(req.body);

  const policy = getPolicyForCollection(collectionName);
  if (!policy) {
    return res.status(400).json({ error: `No archival policy found for collection: ${collectionName}` });
  }

  const result = await archiveService.archiveOldRecords(
    collectionName,
    clinicId.toString(),
    policy,
    userId
  );

  return res.status(200).json({
    message: 'Archival completed',
    result,
  });
});

export const deleteExpiredArchives = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const deletedCount = await archiveService.deleteExpiredArchives(clinicId.toString());

  return res.status(200).json({
    message: 'Expired archives deleted',
    deletedCount,
  });
});
