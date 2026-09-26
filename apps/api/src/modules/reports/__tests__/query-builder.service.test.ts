import {
  compileQuery,
  QueryValidationError,
  type QueryDefinition,
} from '../analytics/query-builder.service';
import { REPORT_TEMPLATES, getReportTemplate } from '../analytics/report-templates';
import { describeDataSources, getDataSource } from '../analytics/datasources';
import { rowsToCsv } from '../analytics/report-export';
import { computeNextRun } from '../models/report-schedule.model';

const CLINIC = 'clinic-123';

describe('compileQuery — tenant scoping', () => {
  it('always injects the clinic scope as the first $match stage', () => {
    const { pipeline } = compileQuery({ source: 'patients' }, CLINIC);
    expect(pipeline[0]).toEqual({ $match: { clinicId: CLINIC } });
  });

  it('cannot be tricked into dropping the clinic scope via the filter', () => {
    const def: QueryDefinition = {
      source: 'patients',
      filter: {
        logic: 'and',
        conditions: [{ field: 'isActive', operator: 'eq', value: true }],
      },
    };
    const { pipeline } = compileQuery(def, CLINIC);
    expect((pipeline[0] as any).$match.clinicId).toBe(CLINIC);
  });

  it('applies a date range to the source date field', () => {
    const { pipeline } = compileQuery(
      { source: 'payments', from: '2026-01-01', to: '2026-02-01' },
      CLINIC
    );
    const match = (pipeline[0] as any).$match;
    expect(match.createdAt.$gte).toBeInstanceOf(Date);
    expect(match.createdAt.$lte).toBeInstanceOf(Date);
  });
});

describe('compileQuery — allow-list enforcement', () => {
  it('rejects an unknown data source', () => {
    expect(() => compileQuery({ source: 'users' } as any, CLINIC)).toThrow(QueryValidationError);
  });

  it('rejects an unknown filter field', () => {
    const def: QueryDefinition = {
      source: 'patients',
      filter: { logic: 'and', conditions: [{ field: 'ssn', operator: 'eq', value: 'x' }] },
    };
    expect(() => compileQuery(def, CLINIC)).toThrow(/Unknown field "ssn"/);
  });

  it('rejects grouping by a non-groupable / unknown field', () => {
    expect(() => compileQuery({ source: 'patients', groupBy: ['nope'] }, CLINIC)).toThrow(
      QueryValidationError
    );
  });

  it('rejects a metric on a non-measurable field', () => {
    expect(() =>
      compileQuery({ source: 'patients', metric: { type: 'sum', field: 'sex' } }, CLINIC)
    ).toThrow(/not measurable/i);
  });

  it('rejects an enum filter value outside the declared set', () => {
    const def: QueryDefinition = {
      source: 'payments',
      filter: {
        logic: 'and',
        conditions: [{ field: 'status', operator: 'eq', value: 'hacked' }],
      },
    };
    expect(() => compileQuery(def, CLINIC)).toThrow(/must be one of/);
  });

  it('caps the number of conditions', () => {
    const conditions = Array.from({ length: 50 }, () => ({
      field: 'isActive' as const,
      operator: 'eq' as const,
      value: true,
    }));
    const def: QueryDefinition = { source: 'patients', filter: { logic: 'and', conditions } };
    expect(() => compileQuery(def, CLINIC)).toThrow(/exceeds 40 conditions/);
  });

  it('escapes regex metacharacters in a "contains" filter', () => {
    const def: QueryDefinition = {
      source: 'encounters',
      filter: {
        logic: 'and',
        conditions: [{ field: 'chiefComplaint', operator: 'contains', value: '.*(' }],
      },
    };
    const { pipeline } = compileQuery(def, CLINIC);
    const regex = (pipeline[1] as any).$match.$and[0].chiefComplaint.$regex;
    expect(regex).toBe('\\.\\*\\(');
  });
});

describe('compileQuery — shape', () => {
  it('builds group + sort + limit + projection stages', () => {
    const def: QueryDefinition = {
      source: 'payments',
      groupBy: ['assetCode'],
      metric: { type: 'sum', field: 'amount' },
      limit: 10,
    };
    const { pipeline, limit } = compileQuery(def, CLINIC);
    const stageNames = pipeline.map((s) => Object.keys(s)[0]);
    expect(stageNames).toEqual(['$match', '$group', '$sort', '$limit', '$project']);
    expect(limit).toBe(10);
  });

  it('supports quarter date bucketing', () => {
    const { pipeline } = compileQuery(
      { source: 'payments', dateBucket: 'quarter', metric: { type: 'count' } },
      CLINIC
    );
    const group = (pipeline.find((s) => '$group' in s) as any).$group;
    expect(JSON.stringify(group._id)).toContain('-Q');
  });

  it('clamps an over-large limit to the ceiling', () => {
    const { limit } = compileQuery({ source: 'patients', limit: 999999 }, CLINIC);
    expect(limit).toBe(5000);
  });
});

describe('report templates', () => {
  it('every template compiles against the query builder', () => {
    for (const template of REPORT_TEMPLATES) {
      expect(() =>
        compileQuery(
          { ...template.query, from: '2026-01-01', to: '2026-02-01' } as QueryDefinition,
          CLINIC
        )
      ).not.toThrow();
    }
  });

  it('exposes templates by id', () => {
    expect(getReportTemplate('revenue-by-month')?.category).toBe('financial');
    expect(getReportTemplate('missing')).toBeUndefined();
  });
});

describe('describeDataSources', () => {
  it('lists only allow-listed sources and marks capabilities', () => {
    const sources = describeDataSources();
    expect(sources.map((s) => s.key).sort()).toEqual(['encounters', 'patients', 'payments']);
    const amount = sources
      .find((s) => s.key === 'payments')!
      .fields.find((f) => f.name === 'amount')!;
    expect(amount.measurable).toBe(true);
  });

  it('getDataSource guards against prototype keys', () => {
    expect(getDataSource('toString')).toBeUndefined();
  });
});

describe('rowsToCsv', () => {
  it('flattens the group key into columns', () => {
    const csv = rowsToCsv([
      { key: { assetCode: 'XLM' }, value: 12 },
      { key: { assetCode: 'USDC' }, value: 3 },
    ]);
    expect(csv).toBe('assetCode,value\nXLM,12\nUSDC,3\n');
  });

  it('quotes cells containing commas', () => {
    const csv = rowsToCsv([{ key: { label: 'a,b' }, value: 1 }]);
    expect(csv).toContain('"a,b"');
  });

  it('handles an empty result set', () => {
    expect(rowsToCsv([])).toBe('value\n');
  });
});

describe('computeNextRun', () => {
  it('returns a time strictly in the future', () => {
    const now = new Date('2026-08-30T10:00:00Z');
    const next = computeNextRun('daily', 6, now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getUTCHours()).toBe(6);
  });

  it('advances a full week for weekly cadence when the hour has passed', () => {
    const now = new Date('2026-08-30T10:00:00Z');
    const next = computeNextRun('weekly', 6, now);
    expect(next.getTime() - now.getTime()).toBeGreaterThanOrEqual(6 * 86400_000);
  });
});
