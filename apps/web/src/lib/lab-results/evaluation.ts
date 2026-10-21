import { getAnalyteDefinitionOrNull, formatReferenceRange } from './referenceRanges';
import type {
  AnalyteDefinition,
  AnalyteKey,
  ComparisonRow,
  LabFinding,
  LabResultSet,
  LabResultsFilters,
  ResultFlag,
  ResultSetOption,
  TrendDirection,
  TrendPoint,
  TrendSummary,
} from './types';

/** Flag predicates used by the table, filters and alert banner. */
export function isCriticalFlag(flag: ResultFlag): boolean {
  return flag === 'critical_low' || flag === 'critical_high';
}

export function isAbnormalFlag(flag: ResultFlag): boolean {
  return flag !== 'normal';
}

/**
 * Classifies a measurement against its reference interval.
 * Critical thresholds take precedence over the normal-range comparison.
 */
export function flagForValue(definition: AnalyteDefinition, value: number): ResultFlag {
  if (definition.criticalLow !== null && value <= definition.criticalLow) return 'critical_low';
  if (definition.criticalHigh !== null && value >= definition.criticalHigh) return 'critical_high';
  if (value < definition.low) return 'low';
  if (value > definition.high) return 'high';
  return 'normal';
}

function normalisedDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Flattens result sets into analysable findings, newest first. */
export function toFindings(sets: readonly LabResultSet[]): LabFinding[] {
  const findings: LabFinding[] = [];

  for (const set of sets) {
    for (const result of set.results) {
      const definition = getAnalyteDefinitionOrNull(result.analyte);
      if (!definition) continue;
      const flag = flagForValue(definition, result.value);
      findings.push({
        setId: set.id,
        patientId: set.patientId,
        panel: set.panel,
        collectedAt: set.collectedAt,
        reportedAt: set.reportedAt,
        orderedBy: set.orderedBy,
        status: set.status,
        analyte: result.analyte,
        name: definition.name,
        shortName: definition.shortName,
        value: result.value,
        unit: definition.unit,
        referenceRange: formatReferenceRange(definition),
        flag,
        isCritical: isCriticalFlag(flag),
        definition,
      });
    }
  }

  return findings.sort((a, b) => {
    const byDate = new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime();
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });
}

/** Findings that crossed a critical threshold — drives the alert banner. */
export function criticalFindings(sets: readonly LabResultSet[]): LabFinding[] {
  return toFindings(sets).filter((finding) => finding.isCritical);
}

export function abnormalCount(findings: readonly LabFinding[]): number {
  return findings.filter((finding) => isAbnormalFlag(finding.flag)).length;
}

/** Applies the search box, facet selects and date range to flattened findings. */
export function filterFindings(
  findings: readonly LabFinding[],
  filters: LabResultsFilters
): LabFinding[] {
  const term = filters.query.trim().toLowerCase();

  return findings.filter((finding) => {
    if (term) {
      const haystack = [
        finding.name,
        finding.shortName,
        finding.panel,
        finding.orderedBy,
        finding.status,
        finding.analyte,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    if (filters.panel !== 'all' && finding.panel !== filters.panel) return false;
    if (filters.status !== 'all' && finding.status !== filters.status) return false;

    const date = normalisedDate(finding.collectedAt);
    if (filters.dateFrom && date < filters.dateFrom) return false;
    if (filters.dateTo && date > filters.dateTo) return false;

    if (filters.onlyAbnormal && !isAbnormalFlag(finding.flag)) return false;
    if (filters.onlyCritical && !finding.isCritical) return false;

    return true;
  });
}

/** Result sets that contain a given analyte, oldest first. */
export function setsContaining(sets: readonly LabResultSet[], analyte: AnalyteKey): LabResultSet[] {
  return sets
    .filter((set) => set.results.some((result) => result.analyte === analyte))
    .slice()
    .sort((a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime());
}

/** Tolerance used to decide whether a change is clinically meaningful. */
export function trendTolerance(definition: AnalyteDefinition): number {
  return Math.max((definition.high - definition.low) * 0.05, 10 ** -definition.decimals);
}

export function buildTrendPoints(
  sets: readonly LabResultSet[],
  analyte: AnalyteKey
): TrendPoint[] {
  const definition = getAnalyteDefinitionOrNull(analyte);
  if (!definition) return [];

  const points: TrendPoint[] = [];
  for (const set of setsContaining(sets, analyte)) {
    const result = set.results.find((item) => item.analyte === analyte);
    if (!result) continue;
    points.push({
      date: normalisedDate(set.collectedAt),
      value: result.value,
      flag: flagForValue(definition, result.value),
    });
  }
  return points;
}

function directionFor(change: number, tolerance: number): TrendDirection {
  if (Math.abs(change) <= tolerance) return 'stable';
  return change > 0 ? 'rising' : 'falling';
}

/** Trend series plus direction for a single analyte across all reports. */
export function buildTrend(sets: readonly LabResultSet[], analyte: AnalyteKey): TrendSummary {
  const definition = getAnalyteDefinitionOrNull(analyte);
  const points = buildTrendPoints(sets, analyte);

  if (!definition || points.length < 2) {
    return { analyte, points, direction: 'stable', change: 0, percentChange: 0 };
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return { analyte, points, direction: 'stable', change: 0, percentChange: 0 };
  }

  const change = Number((last.value - first.value).toFixed(definition.decimals));
  const percentChange =
    first.value === 0 ? 0 : Number(((change / Math.abs(first.value)) * 100).toFixed(1));

  return {
    analyte,
    points,
    direction: directionFor(change, trendTolerance(definition)),
    change,
    percentChange,
  };
}

/** Analytes available for trending, derived from the loaded result sets. */
export function availableAnalytes(sets: readonly LabResultSet[]): AnalyteKey[] {
  const keys = new Set<AnalyteKey>();
  for (const set of sets) {
    for (const result of set.results) keys.add(result.analyte);
  }
  return Array.from(keys);
}

/**
 * Compares two reports analyte by analyte. Only analytes present in both are
 * compared, so the table never implies a measurement that is missing.
 */
export function compareResultSets(
  previous: LabResultSet | null,
  current: LabResultSet | null
): ComparisonRow[] {
  if (!previous || !current) return [];

  const rows: ComparisonRow[] = [];

  for (const result of current.results) {
    const definition = getAnalyteDefinitionOrNull(result.analyte);
    const earlier = previous.results.find((item) => item.analyte === result.analyte);
    if (!definition || !earlier) continue;

    const change = Number((result.value - earlier.value).toFixed(definition.decimals));
    const percentChange =
      earlier.value === 0 ? 0 : Number(((change / Math.abs(earlier.value)) * 100).toFixed(1));

    rows.push({
      analyte: result.analyte,
      name: definition.name,
      unit: definition.unit,
      previous: earlier.value,
      current: result.value,
      change,
      percentChange,
      direction: directionFor(change, trendTolerance(definition)),
      previousFlag: flagForValue(definition, earlier.value),
      currentFlag: flagForValue(definition, result.value),
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function resultSetOptions(sets: readonly LabResultSet[]): ResultSetOption[] {
  return sets.map((set) => ({
    value: set.id,
    label: `${set.panel} · ${normalisedDate(set.collectedAt)} · ${set.status}`,
  }));
}

/** Newest first, used as the default ordering for tables and selects. */
export function sortSetsNewestFirst(sets: readonly LabResultSet[]): LabResultSet[] {
  return sets
    .slice()
    .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
}

