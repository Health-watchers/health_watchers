import { ArchiveModel } from './archive.model';
import { type ArchivePolicy } from './archive-policies';
import { getConnection, Types } from 'mongoose';
import logger from '../../utils/logger';

export class ArchiveService {
  private connection = getConnection();

  async archiveOldRecords(
    collectionName: string,
    clinicId: string,
    policy: ArchivePolicy,
    userId?: string
  ): Promise<{ archivedCount: number; skippedCount: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.archiveAfterDays);

      const collection = this.connection.collection(collectionName);
      const query = {
        clinicId: new Types.ObjectId(clinicId),
        createdAt: { $lt: cutoffDate },
      };

      const documentsToArchive = await collection.find(query).limit(policy.batchSize).toArray();

      let archivedCount = 0;
      let skippedCount = 0;

      for (const doc of documentsToArchive) {
        try {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + policy.retentionDays);

          const restoreableUntil = new Date();
          // Allow restore for 90 days or less
          restoreableUntil.setDate(
            restoreableUntil.getDate() + Math.min(90, policy.retentionDays / 30)
          );

          await ArchiveModel.create({
            originalCollectionName: collectionName,
            originalDocumentId: doc._id,
            archiveReason: 'age',
            archivedData: doc,
            archivedAt: new Date(),
            archivedBy: userId ? new Types.ObjectId(userId) : undefined,
            expiryDate,
            restoreMetadata: {
              restoreableUntil,
            },
            clinicId: new Types.ObjectId(clinicId),
          });

          await collection.deleteOne({ _id: doc._id });
          archivedCount++;
        } catch (error) {
          logger.error(
            { err: error },
            `Failed to archive document ${doc._id} from ${collectionName}`
          );
          skippedCount++;
        }
      }

      logger.info(
        `Archive operation completed for ${collectionName}: archived=${archivedCount}, skipped=${skippedCount}`
      );
      return { archivedCount, skippedCount };
    } catch (error) {
      logger.error({ err: error }, `Error archiving records from ${collectionName}`);
      throw error;
    }
  }

  async retrieveArchivedRecords(
    clinicId: string,
    collectionName?: string,
    limit: number = 100,
    offset: number = 0
  ) {
    const query: Record<string, any> = {
      clinicId: new Types.ObjectId(clinicId),
    };

    if (collectionName) {
      query.originalCollectionName = collectionName;
    }

    const total = await ArchiveModel.countDocuments(query);
    const records = await ArchiveModel.find(query)
      .sort({ archivedAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    return {
      total,
      records,
      pagination: { limit, offset },
    };
  }

  async restoreArchivedRecord(archiveId: string, clinicId: string, userId: string) {
    const archive = await ArchiveModel.findOne({
      _id: new Types.ObjectId(archiveId),
      clinicId: new Types.ObjectId(clinicId),
    });

    if (!archive) {
      throw new Error('Archive record not found');
    }

    if (archive.restoreMetadata && archive.restoreMetadata.restoreableUntil < new Date()) {
      throw new Error('Archive is no longer restorable');
    }

    const collection = this.connection.collection(archive.originalCollectionName);
    const docId = archive.originalDocumentId;

    await collection.updateOne({ _id: docId }, { $set: archive.archivedData }, { upsert: true });

    if (archive.restoreMetadata) {
      archive.restoreMetadata.restoredAt = new Date();
      archive.restoreMetadata.restoredBy = new Types.ObjectId(userId);
    }

    await archive.save();

    return archive;
  }

  async deleteExpiredArchives(clinicId: string): Promise<number> {
    const result = await ArchiveModel.deleteMany({
      clinicId: new Types.ObjectId(clinicId),
      expiryDate: { $lt: new Date() },
    });

    return result.deletedCount || 0;
  }

  async getArchiveStats(clinicId: string) {
    const stats = await ArchiveModel.aggregate([
      {
        $match: { clinicId: new Types.ObjectId(clinicId) },
      },
      {
        $group: {
          _id: '$originalCollectionName',
          count: { $sum: 1 },
          oldestArchive: { $min: '$archivedAt' },
          newestArchive: { $max: '$archivedAt' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const total = await ArchiveModel.countDocuments({
      clinicId: new Types.ObjectId(clinicId),
    });

    return { total, byCollection: stats };
  }
}

export default new ArchiveService();
