import {
  abnormalCount,
  availableAnalytes,
  buildTrend,
  compareResultSets,
  criticalFindings,
  filterFindings,
  flagForValue,
  isAbnormalFlag,
  isCriticalFlag,
  sortSetsNewestFirst,
  toFindings,
} from '@/lib/lab-results/evaluation';
import {
  buildLabExportRows,
  labExportFilename,
  labExportSummary,
  labExportToCsv,
} from '@/lib/lab-results/export';
import { getAnalyteDefinition } from '@/lib/lab-results/referenceRanges';
import { getSampleLabPatient, getSampleLabSets } from '@/lib/lab-results/sampleData';
import type { AnalyteKey, LabResultsFilters } from '@/lib/lab-results/types';

const SETS = getSampleLabSets('p-1001');
const FINDINGS = toFindings(SETS);

const NO_FILTERS: LabResultsFilters = {
  query: '',
  panel: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: '',
  onlyAbnormal: false,
  onlyCritical: false,
};

function flagOf(analyte: AnalyteKey, value: number) {
  return flagForValue(getAnalyteDefinition(analyte), value);
}

describe('reference range flagging (#1313)', () => {
  it('classifies normal, low, high and critical results', () => {
    expect(flagOf('sodium', 138)).toBe('normal');
    expect(flagOf('potassium', 5.6)).toBe('high');
    expect(flagOf('creatinine', 145)).toBe('high');
    expect(flagOf('egfr', 52)).toBe('low');
    expect(flagOf('haemoglobin', 6.8)).toBe('critical_low');
    expect(flagOf('inr', 5.4)).toBe('critical_high');
  });

  it('exposes flag predicates', () => {
    expect(isCriticalFlag('critical_high')).toBe(true);
    expect(isCriticalFlag('high')).toBe(false);
    expect(isAbnormalFlag('low')).toBe(true);
    expect(isAbnormalFlag('normal')).toBe(false);
  });

  it('flattens result sets into findings and counts abnormalities', () => {
    expect(FINDINGS).toHaveLength(30);
    expect(abnormalCount(FINDINGS)).toBe(21);
  });

  it('surfaces critical findings for the alert banner', () => {
    const critical = criticalFindings(SETS);
    expect(critical).toHaveLength(2);
    expect(critical.map((finding) => finding.analyte).sort()).toEqual(['haemoglobin', 'inr']);
  });
});

describe('search and filtering (#1313)', () => {
  it('searches analyte names, panels and the ordering clinician', () => {
    expect(filterFindings(FINDINGS, { ...NO_FILTERS, query: 'inr' })).toHaveLength(2);
    expect(filterFindings(FINDINGS, { ...NO_FILTERS, query: 'renal' })).toHaveLength(4);
    expect(filterFindings(FINDINGS, { ...NO_FILTERS, query: 'eze' })).toHaveLength(30);
    expect(filterFindings(FINDINGS, { ...NO_FILTERS, query: 'nothing' })).toHaveLength(0);
  });

  it('combines panel, flag, status and date filters', () => {
    expect(filterFindings(FINDINGS, { ...NO_FILTERS, panel: 'Lipid profile' })).toHaveLength(8);
    expect(
      filterFindings(FINDINGS, { ...NO_FILTERS, panel: 'Lipid profile', onlyAbnormal: true })
    ).toHaveLength(3);
    expect(filterFindings(FINDINGS, { ...NO_FILTERS, onlyCritical: true })).toHaveLength(2);
    expect(
      filterFindings(FINDINGS, {
        ...NO_FILTERS,
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      })
    ).toHaveLength(11);
    expect(filterFindings(FINDINGS, { ...NO_FILTERS, status: 'corrected' })).toHaveLength(3);
  });
});

describe('trend analysis (#1313)', () => {
  it('reports the direction of travel for an analyte', () => {
    const creatinine = buildTrend(SETS, 'creatinine');
    expect(creatinine.points).toHaveLength(2);
    expect(creatinine.change).toBe(47);
    expect(creatinine.percentChange).toBe(48);
    expect(creatinine.direction).toBe('rising');
  });

  it('handles analytes with a single measurement', () => {
    const crp = buildTrend(SETS, 'crp');
    expect(crp.points).toHaveLength(1);
    expect(crp.direction).toBe('stable');
    expect(crp.change).toBe(0);
  });

  it('lists the analytes available to trend', () => {
    const analytes = availableAnalytes(SETS);
    expect(analytes).toContain('creatinine');
    expect(analytes).toContain('inr');
  });
});

describe('result comparison (#1313)', () => {
  it('deltas shared analytes between two reports', () => {
    const rows = compareResultSets(SETS[2] ?? null, SETS[8] ?? null);
    expect(rows).toHaveLength(2);

    const creatinine = rows.find((row) => row.analyte === 'creatinine');
    expect(creatinine?.previous).toBe(98);
    expect(creatinine?.current).toBe(145);
    expect(creatinine?.change).toBe(47);
    expect(creatinine?.direction).toBe('rising');

    const egfr = rows.find((row) => row.analyte === 'egfr');
    expect(egfr?.change).toBe(-26);
    expect(egfr?.direction).toBe('falling');
    expect(egfr?.previousFlag).toBe('low');
    expect(egfr?.currentFlag).toBe('low');
  });

  it('returns no rows when a report is not selected', () => {
    expect(compareResultSets(null, SETS[0] ?? null)).toEqual([]);
  });
});

describe('result export (#1313)', () => {
  const patient = getSampleLabPatient('p-1001');

  it('includes the full reference detail for every finding', () => {
    const rows = buildLabExportRows(patient, FINDINGS);
    expect(rows).toHaveLength(30);
    expect(rows[0]?.patient_mrn).toBe('MRN-1001');

    const creatinine = rows.find((row) => row.analyte === 'Creatinine');
    expect(creatinine?.value).toBe('145');
    expect(creatinine?.unit).toBe('µmol/L');
    expect(creatinine?.reference_range).toBe('59–104');
    expect(creatinine?.flag).toBe('high');
  });

  it('summarises abnormal and critical counts', () => {
    expect(labExportSummary(FINDINGS)).toEqual({ rows: 30, abnormal: 21, critical: 2 });
  });

  it('serialises a header plus one row per finding', () => {
    const csv = labExportToCsv(buildLabExportRows(patient, FINDINGS));
    const lines = csv.split('\n');
    expect(lines[0]).toContain('reference_range');
    expect(lines).toHaveLength(31);
    expect(csv).toContain('International normalised ratio');
  });

  it('builds a stable file name', () => {
    expect(labExportFilename(patient, new Date('2026-09-24T00:00:00.000Z'))).toBe(
      'lab-results-ada-okafor-2026-09-24.csv'
    );
  });
});

describe('patient isolation (#1313)', () => {
  it('keeps result sets scoped to their patient', () => {
    const otherPatient = getSampleLabSets('p-1002');
    expect(otherPatient).toHaveLength(2);
    expect(toFindings(otherPatient)).toHaveLength(4);
    expect(criticalFindings(otherPatient)).toHaveLength(0);
  });

  it('orders result sets newest first', () => {
    expect(sortSetsNewestFirst(SETS)[0]?.collectedAt.slice(0, 10)).toBe('2026-09-15');
  });
});

