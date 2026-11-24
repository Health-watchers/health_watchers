import {
  createCarePlanSchema,
  updateCarePlanSchema,
  reviewCarePlanSchema,
  idParamSchema,
} from '../care-plan.validation';

const validCreate = {
  patientId: 'patient-1',
  condition: 'Hypertension',
  reviewDate: '2026-01-01T00:00:00.000Z',
};

describe('createCarePlanSchema', () => {
  it('accepts a minimal valid payload and applies defaults', () => {
    const result = createCarePlanSchema.parse(validCreate);
    expect(result.goals).toEqual([]);
    expect(result.interventions).toEqual([]);
    expect(result.monitoringSchedule).toEqual([]);
  });

  it('rejects a payload missing condition', () => {
    const { condition, ...rest } = validCreate;
    const result = createCarePlanSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid reviewDate format', () => {
    const result = createCarePlanSchema.safeParse({ ...validCreate, reviewDate: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('rejects a goal with an invalid status', () => {
    const result = createCarePlanSchema.safeParse({
      ...validCreate,
      goals: [{ description: 'Goal', status: 'unknown' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('updateCarePlanSchema', () => {
  it('allows a partial update without patientId', () => {
    const result = updateCarePlanSchema.safeParse({ status: 'completed' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    const result = updateCarePlanSchema.safeParse({ status: 'archived' });
    expect(result.success).toBe(false);
  });
});

describe('reviewCarePlanSchema', () => {
  it('accepts an empty review payload', () => {
    expect(reviewCarePlanSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an invalid nextReviewDate', () => {
    expect(reviewCarePlanSchema.safeParse({ nextReviewDate: 'bad-date' }).success).toBe(false);
  });
});

describe('idParamSchema', () => {
  it('rejects an empty id', () => {
    expect(idParamSchema.safeParse({ id: '' }).success).toBe(false);
  });

  it('accepts a non-empty id', () => {
    expect(idParamSchema.safeParse({ id: 'abc123' }).success).toBe(true);
  });
});
