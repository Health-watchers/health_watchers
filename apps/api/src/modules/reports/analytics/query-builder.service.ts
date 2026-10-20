/**
 * #1251 — Custom query builder.
 *
 * Translates a validated, declarative query definition into a MongoDB
 * aggregation pipeline. Supports:
 *   - AND / OR groups of comparison conditions (complex logic)
 *   - date-range scoping
 *   - group-by (up to 2 dimensions) with a numeric metric
 *   - date-bucketed grouping (day / week / month / quarter / year)
 *   - result limiting
 *
 * Safety model: the collection, every field path and every operator are
 * checked against the data-source registry (`datasources.ts`) before a
 * pipeline stage is built. The tenant scope (`clinicId`) is always injected
 * server-side and cannot be overridden by the caller.
 */

import type { PipelineStage } from 'mongoose';
import { getDataSource, type DataSourceDef, type FieldDef } from './datasources';

export type ComparisonOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'contains'
  | 'exists';

export interface QueryCondition {
  field: string;
  operator: ComparisonOperator;
  value: unknown;
}

export interface QueryFilterGroup {
  logic: 'and' | 'or';
  conditions: Array<QueryCondition | QueryFilterGroup>;
}

export type DateBucket = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface QueryDefinition {
  source: string;
  /** Optional root filter group. */
  filter?: QueryFilterGroup;
  /** Inclusive lower / upper bound applied to the source's date field. */
  from?: string;
  to?: string;
  /** Up to two groupable fields. */
  groupBy?: string[];
  /** Bucket the source date field instead of / in addition to `groupBy`. */
  dateBucket?: DateBucket;
  metric?: {
    type: 'count' | 'sum' | 'avg' | 'min' | 'max';
    /** Required for every type except `count`; must be a measurable field. */
    field?: string;
  };
  sort?: { by: 'metric' | 'key'; direction: 'asc' | 'desc' };
  limit?: number;
}

export class QueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

const MAX_CONDITIONS = 40;
const MAX_GROUP_DEPTH = 4;
const MAX_GROUP_BY = 2;
const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 500;

const OP_MAP: Record<Exclude<ComparisonOperator, 'contains' | 'exists'>, string> = {
  eq: '$eq',
  ne: '$ne',
  gt: '$gt',
  gte: '$gte',
  lt: '$lt',
  lte: '$lte',
  in: '$in',
  nin: '$nin',
};

function coerceValue(def: FieldDef, raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map((v) => coerceValue(def, v));
  switch (def.type) {
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new QueryValidationError(`"${def.path}" expects a number`);
      return n;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new QueryValidationError(`"${def.path}" expects a boolean`);
    case 'date': {
      const d = new Date(raw as string);
      if (Number.isNaN(d.getTime())) throw new QueryValidationError(`"${def.path}" expects a date`);
      return d;
    }
    case 'enum':
      if (def.values && !def.values.includes(String(raw))) {
        throw new QueryValidationError(`"${def.path}" must be one of: ${def.values.join(', ')}`);
      }
      return String(raw);
    default:
      return String(raw);
  }
}

function buildCondition(ds: DataSourceDef, cond: QueryCondition): Record<string, unknown> {
  const def = ds.fields[cond.field];
  if (!def) throw new QueryValidationError(`Unknown field "${cond.field}" on source "${ds.key}"`);

  if (cond.operator === 'exists') {
    return { [def.path]: { $exists: Boolean(cond.value) } };
  }

  if (cond.operator === 'contains') {
    if (def.type !== 'string') {
      throw new QueryValidationError(`"contains" is only valid on string fields`);
    }
    // Escape regex metacharacters — the value is user input.
    const safe = String(cond.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { [def.path]: { $regex: safe, $options: 'i' } };
  }

  if ((cond.operator === 'in' || cond.operator === 'nin') && !Array.isArray(cond.value)) {
    throw new QueryValidationError(`"${cond.operator}" expects an array value`);
  }

  return { [def.path]: { [OP_MAP[cond.operator]]: coerceValue(def, cond.value) } };
}

function isGroup(node: QueryCondition | QueryFilterGroup): node is QueryFilterGroup {
  return (node as QueryFilterGroup).logic !== undefined;
}

function buildFilter(
  ds: DataSourceDef,
  group: QueryFilterGroup,
  depth: number,
  counter: { n: number }
): Record<string, unknown> {
  if (depth > MAX_GROUP_DEPTH) {
    throw new QueryValidationError(`Filter nesting exceeds ${MAX_GROUP_DEPTH} levels`);
  }
  if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
    throw new QueryValidationError('Filter group must have at least one condition');
  }

  const parts = group.conditions.map((node) => {
    if (isGroup(node)) return buildFilter(ds, node, depth + 1, counter);
    counter.n += 1;
    if (counter.n > MAX_CONDITIONS) {
      throw new QueryValidationError(`Query exceeds ${MAX_CONDITIONS} conditions`);
    }
    return buildCondition(ds, node);
  });

  return group.logic === 'or' ? { $or: parts } : { $and: parts };
}

const BUCKET_FORMAT: Record<DateBucket, string> = {
  day: '%Y-%m-%d',
  week: '%G-W%V',
  month: '%Y-%m',
  quarter: '%Y', // quarter handled separately below
  year: '%Y',
};

function groupKeyExpression(ds: DataSourceDef, def: QueryDefinition): Record<string, unknown> {
  const key: Record<string, unknown> = {};

  for (const raw of def.groupBy ?? []) {
    // `raw` is validated against the data-source allow-list before use — not a
    // free-form injection sink.
    // eslint-disable-next-line security/detect-object-injection
    const field = ds.fields[raw];
    if (!field) throw new QueryValidationError(`Unknown groupBy field "${raw}"`);
    if (!field.groupable) throw new QueryValidationError(`Field "${raw}" is not groupable`);
    // eslint-disable-next-line security/detect-object-injection
    key[raw] = `$${field.path}`;
  }

  if (def.dateBucket) {
    const path = `$${ds.dateField}`;
    if (def.dateBucket === 'quarter') {
      key.period = {
        $concat: [
          { $toString: { $year: path } },
          '-Q',
          { $toString: { $ceil: { $divide: [{ $month: path }, 3] } } },
        ],
      };
    } else {
      key.period = { $dateToString: { format: BUCKET_FORMAT[def.dateBucket], date: path } };
    }
  }

  if (Object.keys(key).length === 0) key.all = 'all';
  return key;
}

// Return type is loose on purpose — the accumulator shape depends on the metric.
function metricExpression(ds: DataSourceDef, def: QueryDefinition): any {
  const metric = def.metric ?? { type: 'count' as const };
  if (metric.type === 'count') return { $sum: 1 };

  if (!metric.field) throw new QueryValidationError(`Metric "${metric.type}" requires a field`);
  const field = ds.fields[metric.field];
  if (!field) throw new QueryValidationError(`Unknown metric field "${metric.field}"`);
  if (!field.measurable)
    throw new QueryValidationError(`Field "${metric.field}" is not measurable`);

  const path = { $toDouble: `$${field.path}` };
  switch (metric.type) {
    case 'sum':
      return { $sum: path };
    case 'avg':
      return { $avg: path };
    case 'min':
      return { $min: path };
    case 'max':
      return { $max: path };
    /* istanbul ignore next */
    default:
      throw new QueryValidationError(`Unsupported metric "${metric.type}"`);
  }
}

export interface CompiledQuery {
  source: string;
  pipeline: PipelineStage[];
  limit: number;
}

/**
 * Compile a validated query definition against a tenant scope.
 * Throws `QueryValidationError` for any input that fails the allow-list.
 */
export function compileQuery(def: QueryDefinition, clinicId: string): CompiledQuery {
  const ds = getDataSource(def.source);
  if (!ds) throw new QueryValidationError(`Unknown data source "${def.source}"`);

  if ((def.groupBy?.length ?? 0) > MAX_GROUP_BY) {
    throw new QueryValidationError(`At most ${MAX_GROUP_BY} groupBy fields are allowed`);
  }

  // 1. Mandatory tenant scope + optional date range — always the first $match
  //    so the compound clinicId indexes are used.
  const match: Record<string, unknown> = { [ds.tenantField]: clinicId };
  if (def.from || def.to) {
    const range: Record<string, Date> = {};
    if (def.from) {
      const d = new Date(def.from);
      if (Number.isNaN(d.getTime())) throw new QueryValidationError('Invalid "from" date');
      range.$gte = d;
    }
    if (def.to) {
      const d = new Date(def.to);
      if (Number.isNaN(d.getTime())) throw new QueryValidationError('Invalid "to" date');
      range.$lte = d;
    }
    match[ds.dateField] = range;
  }

  const pipeline: PipelineStage[] = [{ $match: match }];

  // 2. User-defined filter group
  if (def.filter) {
    pipeline.push({ $match: buildFilter(ds, def.filter, 0, { n: 0 }) });
  }

  // 3. Group + metric
  const groupStage: PipelineStage.Group = {
    $group: {
      _id: groupKeyExpression(ds, def),
      value: metricExpression(ds, def),
    },
  };
  pipeline.push(groupStage);

  // 4. Sort
  const sort = def.sort ?? { by: 'metric', direction: 'desc' };
  pipeline.push({
    $sort: { [sort.by === 'metric' ? 'value' : '_id']: sort.direction === 'asc' ? 1 : -1 },
  });

  // 5. Limit — always bounded
  const limit = Math.min(Math.max(1, def.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  pipeline.push({ $limit: limit });

  pipeline.push({ $project: { _id: 0, key: '$_id', value: 1 } });

  return { source: ds.key, pipeline, limit };
}

export interface QueryResult {
  source: string;
  rows: Array<{ key: Record<string, unknown>; value: number }>;
  rowCount: number;
  elapsedMs: number;
  truncated: boolean;
}

/** Compile + run a query definition, returning rows plus timing metadata. */
export async function runQuery(def: QueryDefinition, clinicId: string): Promise<QueryResult> {
  const compiled = compileQuery(def, clinicId);
  const ds = getDataSource(compiled.source)!;
  const started = Date.now();
  const rows = await ds
    .model()
    .aggregate(compiled.pipeline)
    .allowDiskUse(true)
    .option({ maxTimeMS: 15_000 });
  const elapsedMs = Date.now() - started;

  return {
    source: compiled.source,
    rows: rows as QueryResult['rows'],
    rowCount: rows.length,
    elapsedMs,
    truncated: rows.length >= compiled.limit,
  };
}
