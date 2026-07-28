import { reportQuerySchema, exportQuerySchema } from '../reports.validation';

describe('reportQuerySchema', () => {
  it('accepts an empty query', () => {
    expect(reportQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a query with from/to/period', () => {
    const result = reportQuerySchema.safeParse({ from: '2026-01-01', to: '2026-02-01', period: 'monthly' });
    expect(result.success).toBe(true);
  });
});

describe('exportQuerySchema', () => {
  it('accepts a valid export request', () => {
    const result = exportQuerySchema.safeParse({ type: 'patients', from: '2026-01-01', to: '2026-02-01' });
    expect(result.success).toBe(true);
  });

  it('rejects an unsupported export type', () => {
    const result = exportQuerySchema.safeParse({ type: 'invoices', from: '2026-01-01', to: '2026-02-01' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing from/to range', () => {
    const result = exportQuerySchema.safeParse({ type: 'patients' });
    expect(result.success).toBe(false);
  });
});
