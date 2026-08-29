import {
  createImmunizationSchema,
  updateImmunizationSchema,
  immunizationParamsSchema,
  listImmunizationsQuerySchema,
} from '../immunization.validation';

const validCreate = {
  vaccineName: 'MMR',
  vaccineCode: '03',
  administeredDate: '2026-01-01T00:00:00.000Z',
  doseNumber: 1,
};

describe('createImmunizationSchema', () => {
  it('accepts a minimal valid payload', () => {
    expect(createImmunizationSchema.safeParse(validCreate).success).toBe(true);
  });

  it('rejects a doseNumber above 20', () => {
    expect(createImmunizationSchema.safeParse({ ...validCreate, doseNumber: 21 }).success).toBe(
      false
    );
  });

  it('rejects a doseNumber below 1', () => {
    expect(createImmunizationSchema.safeParse({ ...validCreate, doseNumber: 0 }).success).toBe(
      false
    );
  });

  it('rejects an invalid administeredDate', () => {
    expect(
      createImmunizationSchema.safeParse({ ...validCreate, administeredDate: 'not-a-date' }).success
    ).toBe(false);
  });

  it('rejects an invalid adverse reaction severity', () => {
    const result = createImmunizationSchema.safeParse({
      ...validCreate,
      adverseReaction: {
        description: 'Reaction',
        severity: 'extreme',
        onsetDate: '2026-01-02T00:00:00.000Z',
        reportedToVAERS: false,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('updateImmunizationSchema', () => {
  it('accepts a partial update with no fields', () => {
    expect(updateImmunizationSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an invalid route when provided', () => {
    expect(updateImmunizationSchema.safeParse({ route: 'Anal' }).success).toBe(false);
  });
});

describe('immunizationParamsSchema', () => {
  it('requires id', () => {
    expect(immunizationParamsSchema.safeParse({}).success).toBe(false);
  });

  it('accepts an optional immunizationId', () => {
    expect(immunizationParamsSchema.safeParse({ id: 'p1', immunizationId: 'i1' }).success).toBe(
      true
    );
  });
});

describe('listImmunizationsQuerySchema', () => {
  it('applies pagination defaults', () => {
    const result = listImmunizationsQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('rejects a limit above 100', () => {
    expect(listImmunizationsQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});
