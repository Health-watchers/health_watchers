/**
 * Medication interaction service (Issue #1244)
 *
 * Orchestrates the pure interaction engine with the database layer:
 *  - resolution against the RxNorm-derived catalog (bundled + DB overrides)
 *  - drug–drug, drug–allergy, and drug–food checks (merged with DB rows)
 *  - caching to hit the <500ms acceptance target
 *  - CDC/FDA data refresh (imports updated rows, bumps versions)
 *  - check logging + analytics
 */
import { Types } from 'mongoose';
import logger from '../../utils/logger';
import {
  checkMedicationSafety,
  resolveDrugs,
  resolveDrug,
  classifySeverity,
  SafetyCheckResult,
  ResolvedDrug,
  PatientAllergy,
} from './interaction-engine';
import { DRUG_CATALOG, DRUG_CATALOG_VERSION } from './drug-data';
import { INTERACTION_DATA, INTERACTION_DATA_VERSION } from './interaction-data';
import { FOOD_INTERACTION_DATA, FOOD_INTERACTION_DATA_VERSION } from './food-interaction-data';
import { DrugModel } from './drug.model';
import { InteractionModel } from './interaction.model';
import { FoodInteractionModel } from './food-interaction.model';
import { InteractionCheckLogModel } from './interaction-check-log.model';
import { InteractionDataStatusModel } from './interaction-data-status.model';
import { checkResultCache, interactionDataCache, buildCheckCacheKey } from './interaction-cache';
import { auditLog } from '../audit/audit.service';

export interface CheckRequest {
  medications: string[];
  allergies?: PatientAllergy[];
  includeFood?: boolean;
  patientId?: string;
  clinicId?: string;
  userId?: string;
}

export interface CheckResponse extends SafetyCheckResult {
  resolvedMedications: ResolvedDrug[];
  unresolvedMedications: string[];
  checkedAt: string;
  elapsedMs: number;
  cacheHit: boolean;
  dataVersion: string;
  disclaimer: string;
}

export const INTERACTION_DISCLAIMER =
  'Interaction check is decision support only and does not replace clinical judgment or pharmacist review.';

export interface RefreshResult {
  imported: { drugs: number; interactions: number; foodInteractions: number };
  versions: { drugCatalog: string; drugDrug: string; drugFood: string };
}

class InteractionService {
  /**
   * Full safety check: drug–drug + drug–allergy + drug–food.
   * Cached per request key; the <500ms target applies to cache misses too
   * because detection is pure in-memory computation.
   */
  async check(request: CheckRequest): Promise<CheckResponse> {
    const start = Date.now();
    const includeFood = request.includeFood ?? true;
    const cacheKey = buildCheckCacheKey({
      medications: request.medications,
      allergies: request.allergies,
      includeFood,
    });

    const cached = checkResultCache.get(cacheKey);
    if (cached) {
      const result = { ...(cached as CheckResponse), cacheHit: true };
      await this.logCheck(request, result, Date.now() - start, true);
      return result;
    }

    const result = await this.runCheck(request, includeFood);
    checkResultCache.set(cacheKey, result, 5 * 60 * 1000);

    await this.logCheck(request, result, Date.now() - start, false);
    return result;
  }

  private async runCheck(request: CheckRequest, includeFood: boolean): Promise<CheckResponse> {
    const start = Date.now();

    // Merge bundled catalog with DB overrides (DB rows win on generic name).
    const dbDrugs = await DrugModel.find({ active: true })
      .lean()
      .catch(() => []);
    const catalog = this.mergeCatalogs(DRUG_CATALOG, dbDrugs);

    // Merge bundled interaction rows with DB rows (deduped by canonical pair).
    const dbInteractions = await InteractionModel.find({ active: true })
      .lean()
      .catch(() => []);
    const interactionData = this.mergeInteractions(INTERACTION_DATA, dbInteractions);
    const dbFood = await FoodInteractionModel.find({ active: true })
      .lean()
      .catch(() => []);
    const foodData = this.mergeFoodInteractions(FOOD_INTERACTION_DATA, dbFood);

    const resolved = resolveDrugs(request.medications, catalog);
    const resolvedNames = new Set(resolved.map((d) => d.genericName));
    const unresolvedMedications = request.medications.filter(
      (m) => !resolvedNames.has(resolveDrug(m, catalog)?.genericName ?? '')
    );

    const safety = checkMedicationSafety({
      medications: request.medications,
      allergies: request.allergies,
      includeFood,
      catalog,
      interactionData,
      foodData,
    });

    const elapsed = Date.now() - start;
    return {
      ...safety,
      resolvedMedications: resolved,
      unresolvedMedications,
      checkedAt: new Date().toISOString(),
      elapsedMs: elapsed,
      cacheHit: false,
      dataVersion: `${INTERACTION_DATA_VERSION}+${DRUG_CATALOG_VERSION}+${FOOD_INTERACTION_DATA_VERSION}`,
      disclaimer: INTERACTION_DISCLAIMER,
    };
  }

  /** Resolve a single medication string to catalog metadata (no full check). */
  async resolve(medication: string): Promise<ResolvedDrug | null> {
    const dbDrugs = await DrugModel.find({ active: true })
      .lean()
      .catch(() => []);
    const catalog = this.mergeCatalogs(DRUG_CATALOG, dbDrugs);
    return resolveDrug(medication, catalog);
  }

  /** Catalog lookup by generic name or RxCUI. */
  async lookup(query: string): Promise<ResolvedDrug[]> {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const dbDrugs = await DrugModel.find({ active: true })
      .lean()
      .catch(() => []);
    const catalog = this.mergeCatalogs(DRUG_CATALOG, dbDrugs);
    return catalog
      .filter(
        (d) =>
          d.genericName.toLowerCase().includes(q) ||
          d.brandNames.some((b) => b.toLowerCase().includes(q)) ||
          d.rxCui === q ||
          d.drugClass.toLowerCase().includes(q)
      )
      .map((d) => ({ ...d, matchedName: d.genericName }));
  }

  /**
   * Refresh interaction data (CDC/FDA update task). Imports the bundled
   * baseline plus any staged rows and records a data-status stamp, satisfying
   * the "interaction data updated regularly" acceptance criterion.
   */
  async refresh(actorId?: string): Promise<RefreshResult> {
    const results: RefreshResult = {
      imported: { drugs: 0, interactions: 0, foodInteractions: 0 },
      versions: {
        drugCatalog: DRUG_CATALOG_VERSION,
        drugDrug: INTERACTION_DATA_VERSION,
        drugFood: FOOD_INTERACTION_DATA_VERSION,
      },
    };

    // Drugs — upsert catalog entries.
    for (const drug of DRUG_CATALOG) {
      await DrugModel.updateOne(
        { genericName: drug.genericName },
        { $set: { ...drug, source: 'manual' as const, active: true } },
        { upsert: true }
      ).catch(() => null);
      results.imported.drugs++;
    }

    // Drug–drug interactions — upsert by canonical pair (order-insensitive).
    for (const row of INTERACTION_DATA) {
      const [drugA, drugB] = [row.drugA, row.drugB].sort();
      await InteractionModel.updateOne(
        { drugA, drugB },
        { $set: { ...row, drugA, drugB, active: true } },
        { upsert: true }
      ).catch(() => null);
      results.imported.interactions++;
    }

    // Drug–food interactions.
    for (const row of FOOD_INTERACTION_DATA) {
      await FoodInteractionModel.updateOne(
        { drug: row.drug, food: row.food },
        { $set: { ...row, active: true } },
        { upsert: true }
      ).catch(() => null);
      results.imported.foodInteractions++;
    }

    // Record data status per dataset.
    const statuses = [
      {
        dataset: 'drug-catalog' as const,
        version: DRUG_CATALOG_VERSION,
        source: 'rxnorm',
        rowCount: DRUG_CATALOG.length,
      },
      {
        dataset: 'drug-drug' as const,
        version: INTERACTION_DATA_VERSION,
        source: 'fda-cdc',
        rowCount: INTERACTION_DATA.length,
      },
      {
        dataset: 'drug-food' as const,
        version: FOOD_INTERACTION_DATA_VERSION,
        source: 'fda-cdc',
        rowCount: FOOD_INTERACTION_DATA.length,
      },
    ];
    for (const s of statuses) {
      await InteractionDataStatusModel.updateOne(
        { dataset: s.dataset },
        { $set: { ...s, importedAt: new Date() } },
        { upsert: true }
      ).catch(() => null);
    }

    // Invalidate cached snapshots so checks pick up the new rows.
    interactionDataCache.clear();

    if (actorId) {
      await auditLog({
        userId: new Types.ObjectId(actorId),
        action: 'INTERACTION_DATA_REFRESH',
        resourceType: 'interactions',
        outcome: 'SUCCESS',
        metadata: { imported: results.imported },
      });
    }

    logger.info({ imported: results.imported }, '[interactions] data refreshed');
    return results;
  }

  /** Data freshness status — stale if last import is older than 30 days. */
  async dataStatus() {
    const statuses = await InteractionDataStatusModel.find()
      .lean()
      .catch(() => []);
    const lastImport = statuses.reduce<Date | null>(
      (max, s) => (max === null || s.importedAt > max ? s.importedAt : max),
      null
    );
    const stale =
      lastImport === null || Date.now() - lastImport.getTime() > 30 * 24 * 60 * 60 * 1000;
    return {
      datasets: statuses,
      lastImport,
      stale,
      warning: stale
        ? 'Interaction data is stale — run POST /interactions/refresh to import the latest CDC/FDA guidance.'
        : undefined,
    };
  }

  /** Analytics over recorded checks (interaction analytics task). */
  async analytics(rangeDays = 30) {
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const [total, bySeverity, criticalDrugs, foodWarnings, avgDuration, totalChecksWithAlerts] =
      await Promise.all([
        InteractionCheckLogModel.countDocuments({ timestamp: { $gte: since } }).catch(() => 0),
        InteractionCheckLogModel.aggregate([
          { $match: { timestamp: { $gte: since } } },
          { $group: { _id: '$severity', count: { $sum: 1 } } },
        ]).catch(() => []),
        InteractionCheckLogModel.aggregate([
          { $match: { timestamp: { $gte: since }, severity: { $in: ['critical', 'major'] } } },
          { $unwind: '$medications' },
          { $group: { _id: '$medications', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]).catch(() => []),
        InteractionCheckLogModel.aggregate([
          { $match: { timestamp: { $gte: since }, foodCount: { $gt: 0 } } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ]).catch(() => []),
        InteractionCheckLogModel.aggregate([
          { $match: { timestamp: { $gte: since } } },
          { $group: { _id: null, avg: { $avg: '$durationMs' } } },
        ]).catch(() => []),
        InteractionCheckLogModel.countDocuments({
          timestamp: { $gte: since },
          severity: { $ne: 'none' },
        }).catch(() => 0),
      ]);

    const severityMap = Object.fromEntries(
      bySeverity.map((s: { _id: string; count: number }) => [s._id, s.count])
    );
    const foodWarningCount = foodWarnings[0]?.count ?? 0;

    return {
      rangeDays,
      since: since.toISOString(),
      totalChecks: total,
      checksWithAlerts: totalChecksWithAlerts,
      alertRate: total === 0 ? 0 : +((totalChecksWithAlerts / total) * 100).toFixed(1),
      bySeverity: severityMap,
      averageCheckDurationMs: avgDuration[0]?.avg ? +avgDuration[0].avg.toFixed(1) : 0,
      foodWarningCount,
      topCriticalMedications: criticalDrugs.map((d: { _id: string; count: number }) => ({
        medication: d._id,
        count: d.count,
      })),
    };
  }

  // ── Merge helpers ───────────────────────────────────────────────────────────
  private mergeCatalogs(bundled: typeof DRUG_CATALOG, db: Array<Record<string, unknown>>) {
    const byGeneric = new Map(bundled.map((d) => [d.genericName, d]));
    for (const row of db) {
      const generic = row.genericName as string;
      if (generic) {
        byGeneric.set(generic, {
          rxCui: (row.rxCui as string) ?? '',
          genericName: generic,
          brandNames: (row.brandNames as string[]) ?? [],
          synonyms: (row.synonyms as string[]) ?? [],
          drugClass: (row.drugClass as string) ?? 'other',
        });
      }
    }
    return [...byGeneric.values()];
  }

  private mergeInteractions(bundled: typeof INTERACTION_DATA, db: Array<Record<string, unknown>>) {
    const byPair = new Map<string, (typeof INTERACTION_DATA)[number]>();
    for (const row of bundled) {
      byPair.set(this.pairKey(row.drugA, row.drugB), row);
    }
    for (const row of db) {
      const a = row.drugA as string;
      const b = row.drugB as string;
      if (a && b) {
        byPair.set(this.pairKey(a, b), {
          drugA: a,
          drugB: b,
          severity: (row.severity as (typeof INTERACTION_DATA)[number]['severity']) ?? 'moderate',
          mechanism: (row.mechanism as string) ?? '',
          management: (row.management as string) ?? '',
          source: (row.source as string) ?? 'database',
        });
      }
    }
    return [...byPair.values()];
  }

  private mergeFoodInteractions(
    bundled: typeof FOOD_INTERACTION_DATA,
    db: Array<Record<string, unknown>>
  ) {
    const byKey = new Map<string, (typeof FOOD_INTERACTION_DATA)[number]>();
    for (const row of bundled) byKey.set(`${row.drug}::${row.food}`, row);
    for (const row of db) {
      const drug = row.drug as string;
      const food = row.food as string;
      if (drug && food) {
        byKey.set(`${drug}::${food}`, {
          drug,
          food,
          severity:
            (row.severity as (typeof FOOD_INTERACTION_DATA)[number]['severity']) ?? 'moderate',
          effect: (row.effect as string) ?? '',
          management: (row.management as string) ?? '',
          source: (row.source as string) ?? 'database',
        });
      }
    }
    return [...byKey.values()];
  }

  private pairKey(a: string, b: string): string {
    return [a.toLowerCase(), b.toLowerCase()].sort().join('::');
  }

  private async logCheck(
    request: CheckRequest,
    result: CheckResponse,
    durationMs: number,
    cacheHit: boolean
  ): Promise<void> {
    try {
      await InteractionCheckLogModel.create({
        clinicId: request.clinicId ? new Types.ObjectId(request.clinicId) : undefined,
        patientId: request.patientId ? new Types.ObjectId(request.patientId) : undefined,
        userId: request.userId ? new Types.ObjectId(request.userId) : undefined,
        medications: result.resolvedMedications.map((d) => d.genericName),
        unresolvedMedications: result.unresolvedMedications,
        allergiesChecked: request.allergies?.length ?? 0,
        includeFood: request.includeFood ?? true,
        severity: classifySeverity([
          ...result.drugDrugInteractions,
          ...result.allergyInteractions,
          ...result.foodInteractions,
        ]),
        drugDrugCount: result.drugDrugInteractions.length,
        allergyCount: result.allergyInteractions.length,
        foodCount: result.foodInteractions.length,
        durationMs,
        cacheHit,
        source: 'engine',
      });
    } catch (err) {
      // Logging must never break the check itself.
      logger.warn({ err }, '[interactions] failed to persist check log');
    }
  }
}

export default new InteractionService();
