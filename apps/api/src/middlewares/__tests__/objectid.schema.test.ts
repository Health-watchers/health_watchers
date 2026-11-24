import { objectIdSchema, patientIdParamSchema } from '../objectid.schema';

describe('objectIdSchema', () => {
  it('accepts a valid 24-char hex ObjectId', () => {
    const result = objectIdSchema.safeParse({ id: '507f1f77bcf86cd799439011' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid id', () => {
    const result = objectIdSchema.safeParse({ id: 'not-an-object-id' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing id', () => {
    const result = objectIdSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('patientIdParamSchema', () => {
  it('accepts a valid 24-char hex patientId', () => {
    const result = patientIdParamSchema.safeParse({ patientId: '507f1f77bcf86cd799439011' });
    expect(result.success).toBe(true);
  });

  it('rejects a patientId with the wrong length', () => {
    const result = patientIdParamSchema.safeParse({ patientId: 'abc123' });
    expect(result.success).toBe(false);
  });
});
