import { Db } from 'mongodb';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

export interface MigrationRecord {
  fileName: string;
  executedAt: Date;
  duration: number;
  status: 'success' | 'failed' | 'rolled_back';
  dataValidation?: {
    docsChecked: number;
    docsValid: number;
    issues: string[];
  };
}

export interface MigrationMetrics {
  migrationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  recordsAffected?: number;
  status: 'pending' | 'in_progress' | 'success' | 'failed';
}

export interface MigrationDryRunResult {
  migrationName: string;
  wouldChange: boolean;
  estimatedRecords: number;
  estimatedDuration: number;
  warnings: string[];
  incompatibilities: string[];
}

const MIGRATION_RECORDS_COLLECTION = '__migration_records';
const MIGRATION_CHECKPOINTS_COLLECTION = '__migration_checkpoints';

export class MigrationManager {
  private db: Db | null = null;
  private metrics: Map<string, MigrationMetrics> = new Map();

  constructor(db?: Db) {
    if (db) this.db = db;
  }

  setDatabase(db: Db): void {
    this.db = db;
  }

  async initialize(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.createCollection(MIGRATION_RECORDS_COLLECTION).catch(() => {
        // Collection might already exist
      });
      await this.db
        .collection(MIGRATION_RECORDS_COLLECTION)
        .createIndex({ fileName: 1, executedAt: -1 });

      await this.db.createCollection(MIGRATION_CHECKPOINTS_COLLECTION).catch(() => {
        // Collection might already exist
      });
      await this.db
        .collection(MIGRATION_CHECKPOINTS_COLLECTION)
        .createIndex({ migrationName: 1, checkpointNumber: 1 });

      logger.info('[migration-manager] Collections initialized');
    } catch (err) {
      logger.error({ err }, '[migration-manager] Failed to initialize collections');
      throw err;
    }
  }

  async recordMigration(record: MigrationRecord): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.collection(MIGRATION_RECORDS_COLLECTION).insertOne({
        ...record,
        createdAt: new Date(),
      });
      logger.info(
        { fileName: record.fileName, duration: record.duration },
        '[migration-manager] Recorded migration'
      );
    } catch (err) {
      logger.error(
        { err, fileName: record.fileName },
        '[migration-manager] Failed to record migration'
      );
      throw err;
    }
  }

  async getMigrationHistory(limit = 50): Promise<MigrationRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const records = await this.db
        .collection(MIGRATION_RECORDS_COLLECTION)
        .find({})
        .sort({ executedAt: -1 })
        .limit(limit)
        .toArray();
      return records as unknown as MigrationRecord[];
    } catch (err) {
      logger.error({ err }, '[migration-manager] Failed to retrieve migration history');
      throw err;
    }
  }

  async getLatestMigration(): Promise<MigrationRecord | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const record = await this.db
        .collection(MIGRATION_RECORDS_COLLECTION)
        .findOne({}, { sort: { executedAt: -1 } });
      return record as unknown as MigrationRecord | null;
    } catch (err) {
      logger.error({ err }, '[migration-manager] Failed to retrieve latest migration');
      throw err;
    }
  }

  async createCheckpoint(
    migrationName: string,
    checkpointNumber: number,
    state: Record<string, unknown>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.collection(MIGRATION_CHECKPOINTS_COLLECTION).insertOne({
        migrationName,
        checkpointNumber,
        state,
        createdAt: new Date(),
      });
      logger.info(
        { migrationName, checkpointNumber },
        '[migration-manager] Checkpoint created for large data migration'
      );
    } catch (err) {
      logger.error({ err, migrationName }, '[migration-manager] Failed to create checkpoint');
      throw err;
    }
  }

  async restoreFromCheckpoint(
    migrationName: string,
    checkpointNumber: number
  ): Promise<Record<string, unknown> | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const checkpoint = await this.db.collection(MIGRATION_CHECKPOINTS_COLLECTION).findOne({
        migrationName,
        checkpointNumber,
      });
      return checkpoint?.state ?? null;
    } catch (err) {
      logger.error({ err, migrationName }, '[migration-manager] Failed to restore checkpoint');
      throw err;
    }
  }

  async validateDataAfterMigration(
    collectionName: string,
    validators: Array<(doc: unknown) => { valid: boolean; issues?: string[] }>
  ): Promise<{ docsChecked: number; docsValid: number; issues: string[] }> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const collection = this.db.collection(collectionName);
      const docs = await collection.find({}).toArray();

      let docsValid = 0;
      const allIssues: string[] = [];

      for (const doc of docs) {
        let docValid = true;
        for (const validator of validators) {
          const result = validator(doc);
          if (!result.valid) {
            docValid = false;
            if (result.issues) {
              allIssues.push(
                `Doc ${(doc as Record<string, unknown>)._id}: ${result.issues.join(', ')}`
              );
            }
          }
        }
        if (docValid) docsValid++;
      }

      logger.info(
        {
          collectionName,
          docsChecked: docs.length,
          docsValid,
          invalidCount: docs.length - docsValid,
        },
        '[migration-manager] Data validation completed'
      );

      return {
        docsChecked: docs.length,
        docsValid,
        issues: allIssues.slice(0, 100), // Limit to 100 issues in report
      };
    } catch (err) {
      logger.error({ err, collectionName }, '[migration-manager] Data validation failed');
      throw err;
    }
  }

  startMigrationTiming(migrationName: string): void {
    const metric: MigrationMetrics = {
      migrationName,
      startTime: Date.now(),
      status: 'in_progress',
    };
    this.metrics.set(migrationName, metric);
  }

  endMigrationTiming(
    migrationName: string,
    status: 'success' | 'failed',
    recordsAffected?: number
  ): MigrationMetrics {
    const metric = this.metrics.get(migrationName);
    if (!metric) {
      logger.warn({ migrationName }, '[migration-manager] No timing data found');
      return {
        migrationName,
        startTime: 0,
        status: 'failed',
      };
    }

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.status = status;
    if (recordsAffected) metric.recordsAffected = recordsAffected;

    logger.info(
      { migrationName, duration: metric.duration, recordsAffected, status },
      '[migration-manager] Migration timing recorded'
    );

    return metric;
  }

  getMigrationMetrics(migrationName: string): MigrationMetrics | undefined {
    return this.metrics.get(migrationName);
  }

  async generateMigrationDocumentation(migrationsDir: string): Promise<string> {
    try {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.ts'));
      let doc = '# Migration Documentation\n\n';
      doc += `Generated: ${new Date().toISOString()}\n\n`;
      doc += '## Migrations\n\n';

      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const description = content.match(/\/\*\*[\s\S]*?\*\//)?.[0] || 'No description';
        doc += `### ${file}\n${description}\n\n`;
      }

      logger.info({ migrationsCount: files.length }, '[migration-manager] Documentation generated');
      return doc;
    } catch (err) {
      logger.error({ err }, '[migration-manager] Failed to generate documentation');
      throw err;
    }
  }

  async checkMigrationCompatibility(
    db: Db,
    collectionName: string,
    schemaChanges: Record<string, unknown>
  ): Promise<{
    compatible: boolean;
    incompatibilities: string[];
  }> {
    try {
      const collection = db.collection(collectionName);
      const sampleDocs = await collection.find({}).limit(10).toArray();

      const incompatibilities: string[] = [];

      for (const key in schemaChanges) {
        const value = schemaChanges[key];
        if (value === 'required' && sampleDocs.some((doc) => !(key in doc))) {
          incompatibilities.push(
            `Field '${key}' marked as required but found in missing documents`
          );
        }
      }

      logger.info(
        { collectionName, incompatibilities: incompatibilities.length },
        '[migration-manager] Compatibility check completed'
      );

      return {
        compatible: incompatibilities.length === 0,
        incompatibilities,
      };
    } catch (err) {
      logger.error({ err, collectionName }, '[migration-manager] Compatibility check failed');
      throw err;
    }
  }

  async simulateMigrationDryRun(
    migrationName: string,
    estimatedRecords: number,
    estimatedDurationMs: number,
    incompatibilities: string[] = []
  ): Promise<MigrationDryRunResult> {
    const warnings: string[] = [];

    if (estimatedRecords > 100000) {
      warnings.push(`Large dataset: ${estimatedRecords} records. Consider batching.`);
    }
    if (estimatedDurationMs > 30000) {
      warnings.push(`Long duration: ${estimatedDurationMs}ms. Consider zero-downtime migration.`);
    }

    logger.info(
      { migrationName, estimatedRecords, estimatedDurationMs, warnings: warnings.length },
      '[migration-manager] Dry-run simulation completed'
    );

    return {
      migrationName,
      wouldChange: estimatedRecords > 0,
      estimatedRecords,
      estimatedDuration: estimatedDurationMs,
      warnings,
      incompatibilities,
    };
  }
}

export const migrationManager = new MigrationManager();
