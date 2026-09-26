/**
 * #1251 — Patient cohort analysis.
 *
 * A cohort is a set of patients selected by a filter (same allow-listed
 * condition grammar as the custom query builder). For that cohort we compute:
 *   - size and active-retention rate
 *   - risk-level mix
 *   - engagement: encounters per patient over an observation window
 *   - outcome mix for the cohort's encounters
 *
 * Everything is tenant-scoped by `clinicId`; the caller never supplies a raw
 * Mongo filter.
 */

import { PatientModel } from '../../patients/models/patient.model';
import { EncounterModel } from '../../encounters/encounter.model';
import { getDataSource } from './datasources';
import {
  QueryValidationError,
  type QueryFilterGroup,
  type QueryDefinition,
} from './query-builder.service';
import { compileQuery } from './query-builder.service';

export interface CohortRequest {
  /** Patient selection filter. */
  filter?: QueryFilterGroup;
  /** Registration window for cohort membership. */
  from?: string;
  to?: string;
  /** Observation window for engagement/outcome metrics (defaults to from/to). */
  observeFrom?: string;
  observeTo?: string;
}

export interface CohortResult {
  cohortSize: number;
  retention: { active: number; inactive: number; activeRate: number };
  riskMix: Array<{ level: string; count: number }>;
  engagement: {
    observationWindow: { from: string | null; to: string | null };
    totalEncounters: number;
    encountersPerPatient: number;
    patientsWithEncounter: number;
    engagementRate: number;
  };
  outcomeMix: Array<{ outcome: string; count: number }>;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Reuse the query compiler to turn the cohort filter into a safe `$match`.
 * We compile a metric-less "count" query and pull the two `$match` stages out.
 */
function buildCohortMatch(req: CohortRequest, clinicId: string): Record<string, unknown> {
  const def: QueryDefinition = {
    source: 'patients',
    filter: req.filter,
    from: req.from,
    to: req.to,
    metric: { type: 'count' },
  };
  const compiled = compileQuery(def, clinicId);
  const matches = compiled.pipeline.filter(
    (s): s is { $match: Record<string, unknown> } => '$match' in s
  );
  // Merge tenant/date match with the optional filter match.
  return matches.reduce((acc, stage) => ({ ...acc, ...stage.$match }), {});
}

export async function analyzeCohort(req: CohortRequest, clinicId: string): Promise<CohortResult> {
  // Validate the patients source exists (defensive — it always does).
  if (!getDataSource('patients')) {
    throw new QueryValidationError('patients data source unavailable');
  }

  const cohortMatch = buildCohortMatch(req, clinicId);

  const observeFrom = req.observeFrom ?? req.from ?? null;
  const observeTo = req.observeTo ?? req.to ?? null;

  const [members, riskRows] = await Promise.all([
    PatientModel.aggregate([
      { $match: cohortMatch },
      {
        $group: {
          _id: null,
          ids: { $push: '$_id' },
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
        },
      },
    ]),
    PatientModel.aggregate([
      { $match: cohortMatch },
      { $group: { _id: { $ifNull: ['$riskLevel', 'unassessed'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const memberRow = members[0] ?? { ids: [], total: 0, active: 0 };
  const cohortIds: unknown[] = memberRow.ids ?? [];
  const cohortSize: number = memberRow.total ?? 0;
  const active: number = memberRow.active ?? 0;

  const encounterMatch: Record<string, unknown> = {
    clinicId,
    patientId: { $in: cohortIds },
  };
  if (observeFrom || observeTo) {
    const range: Record<string, Date> = {};
    if (observeFrom) range.$gte = new Date(observeFrom);
    if (observeTo) range.$lte = new Date(observeTo);
    encounterMatch.createdAt = range;
  }

  const [engagementRows, outcomeRows] = cohortSize
    ? await Promise.all([
        EncounterModel.aggregate([
          { $match: encounterMatch },
          {
            $group: {
              _id: null,
              totalEncounters: { $sum: 1 },
              patients: { $addToSet: '$patientId' },
            },
          },
        ]),
        EncounterModel.aggregate([
          { $match: { ...encounterMatch, outcome: { $exists: true, $ne: null } } },
          { $group: { _id: '$outcome', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      ])
    : [[], []];

  const engRow = engagementRows[0] ?? { totalEncounters: 0, patients: [] };
  const totalEncounters: number = engRow.totalEncounters ?? 0;
  const patientsWithEncounter: number = (engRow.patients ?? []).length;

  return {
    cohortSize,
    retention: {
      active,
      inactive: cohortSize - active,
      activeRate: cohortSize ? round((active / cohortSize) * 100) : 0,
    },
    riskMix: riskRows.map((r) => ({ level: String(r._id), count: r.count })),
    engagement: {
      observationWindow: { from: observeFrom, to: observeTo },
      totalEncounters,
      encountersPerPatient: cohortSize ? round(totalEncounters / cohortSize) : 0,
      patientsWithEncounter,
      engagementRate: cohortSize ? round((patientsWithEncounter / cohortSize) * 100) : 0,
    },
    outcomeMix: outcomeRows.map((r) => ({ outcome: String(r._id), count: r.count })),
  };
}
