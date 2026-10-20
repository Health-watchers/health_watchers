import { z } from 'zod';

const comparisonOperator = z.enum([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'contains',
  'exists',
]);

const conditionSchema = z.object({
  field: z.string().min(1).max(64),
  operator: comparisonOperator,
  value: z.any(),
});

// Recursive AND/OR group. Depth is additionally capped inside the compiler.
export const filterGroupSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    logic: z.enum(['and', 'or']),
    conditions: z
      .array(z.union([conditionSchema, filterGroupSchema]))
      .min(1)
      .max(40),
  })
);

export const queryDefinitionSchema = z.object({
  source: z.enum(['patients', 'encounters', 'payments']),
  filter: filterGroupSchema.optional(),
  // Date strings are parsed and validated by the query compiler.
  from: z.string().min(4).max(40).optional(),
  to: z.string().min(4).max(40).optional(),
  groupBy: z.array(z.string().min(1).max(64)).max(2).optional(),
  dateBucket: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
  metric: z
    .object({
      type: z.enum(['count', 'sum', 'avg', 'min', 'max']),
      field: z.string().min(1).max(64).optional(),
    })
    .optional(),
  sort: z
    .object({
      by: z.enum(['metric', 'key']),
      direction: z.enum(['asc', 'desc']),
    })
    .optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

export const runQuerySchema = z.object({
  query: queryDefinitionSchema,
});

export const runTemplateSchema = z.object({
  templateId: z.string().min(1).max(64),
  from: z.string().optional(),
  to: z.string().optional(),
  overrides: z
    .object({
      groupBy: z.array(z.string()).max(2).optional(),
      dateBucket: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
      limit: z.number().int().min(1).max(5000).optional(),
    })
    .optional(),
});

export const cohortSchema = z.object({
  filter: filterGroupSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  observeFrom: z.string().optional(),
  observeTo: z.string().optional(),
});

export const createScheduleSchema = z
  .object({
    name: z.string().min(1).max(120),
    templateId: z.string().min(1).max(64).optional(),
    query: queryDefinitionSchema.optional(),
    cadence: z.enum(['daily', 'weekly', 'monthly']),
    hourUtc: z.number().int().min(0).max(23).optional(),
    windowDays: z.number().int().min(1).max(366).optional(),
    format: z.enum(['json', 'csv']).optional(),
    recipients: z.array(z.string().min(1).max(200)).max(25).optional(),
  })
  .refine((v) => !!v.templateId !== !!v.query, {
    message: 'Provide exactly one of templateId or query',
  });

export const updateScheduleSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    cadence: z.enum(['daily', 'weekly', 'monthly']).optional(),
    hourUtc: z.number().int().min(0).max(23).optional(),
    windowDays: z.number().int().min(1).max(366).optional(),
    format: z.enum(['json', 'csv']).optional(),
    recipients: z.array(z.string().min(1).max(200)).max(25).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const widgetSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  visualization: z.enum(['table', 'bar', 'line', 'pie', 'kpi']),
  templateId: z.string().min(1).max(64).optional(),
  query: queryDefinitionSchema.optional(),
  layout: z.object({
    x: z.number().int().min(0).max(11),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1).max(24),
  }),
  windowDays: z.number().int().min(1).max(366).optional(),
  refreshSeconds: z.number().int().min(30).max(86400).optional(),
});

export const upsertDashboardSchema = z.object({
  name: z.string().min(1).max(120),
  shared: z.boolean().optional(),
  widgets: z.array(widgetSchema).max(50),
});

export type QueryDefinitionInput = z.infer<typeof queryDefinitionSchema>;
