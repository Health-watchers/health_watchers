/**
 * Property-based tests for the Zod schemas guarding the patient, encounter,
 * payment and appointment endpoints.
 *
 * - Valid inputs (including unicode names and boundary numbers) are always accepted.
 * - Arbitrary JSON — huge numbers, unicode, prototype-pollution keys — never
 *   crashes validateRequest: it either calls next() or answers 400.
 */
import fc from 'fast-check';
import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { validateRequest } from '../../middlewares/validate.middleware';
import {
  createPatientSchema,
  updatePatientSchema,
  patientSearchQuerySchema,
} from '../../modules/patients/patients.validation';
import {
  createEncounterSchema,
  updateEncounterSchema,
} from '../../modules/encounters/encounter.validation';
import {
  createPaymentIntentSchema,
  listPaymentsQuerySchema,
} from '../../modules/payments/payments.validation';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentsQuerySchema,
} from '../../modules/appointments/appointments.validation';

const NUM_RUNS = 300;

// ── Arbitraries ──────────────────────────────────────────────────────────────

const objectId = fc.stringMatching(/^[a-f\d]{24}$/);
const nonEmptyText = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 60 });
const pastDate = fc.date({ min: new Date('1900-01-01'), max: new Date(), noInvalidDate: true });
const isoDateTime = fc
  .date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true })
  .map((d) => d.toISOString());
const stellarAmount = fc
  .tuple(fc.bigInt({ min: 0n, max: 10n ** 15n }), fc.option(fc.stringMatching(/^\d{1,7}$/)))
  .map(([whole, frac]) => (frac === null ? `${whole}` : `${whole}.${frac}`))
  .filter((v) => Number(v) > 0);

const validPatient = fc.record(
  {
    firstName: nonEmptyText,
    lastName: nonEmptyText,
    // Keep within the 150-year limit.
    dateOfBirth: pastDate
      .filter((d) => Date.now() - d.getTime() < 149 * 365.25 * 24 * 3600 * 1000)
      .map((d) => d.toISOString()),
    sex: fc.constantFrom('M', 'F', 'O'),
    contactNumber: fc.stringMatching(/^\+?[\d\s\-().]{7,20}$/),
    address: fc.string({ unit: 'grapheme', maxLength: 200 }),
  },
  { requiredKeys: ['firstName', 'lastName', 'dateOfBirth', 'sex'] }
);

const validEncounter = fc.record(
  {
    patientId: objectId,
    clinicId: objectId,
    attendingDoctorId: objectId,
    chiefComplaint: fc.string({ unit: 'grapheme', minLength: 3, maxLength: 200 }),
    status: fc.constantFrom('open', 'closed', 'follow-up', 'cancelled'),
    notes: fc.string({ maxLength: 5000 }),
    diagnosis: fc.array(
      fc.record({ code: nonEmptyText, description: nonEmptyText, isPrimary: fc.boolean() }),
      { maxLength: 5 }
    ),
    vitalSigns: fc.record(
      {
        heartRate: fc.double({ min: Number.MIN_VALUE, max: 1e6, noNaN: true }),
        oxygenSaturation: fc.double({ min: 0, max: 100, noNaN: true }),
        temperature: fc.double({ min: Number.MIN_VALUE, max: 1e3, noNaN: true }),
      },
      { requiredKeys: [] }
    ),
    prescriptions: fc.array(
      fc.record({ medication: nonEmptyText, dosage: nonEmptyText, frequency: nonEmptyText }),
      { maxLength: 5 }
    ),
    followUpDate: isoDateTime,
  },
  { requiredKeys: ['patientId', 'clinicId', 'attendingDoctorId', 'chiefComplaint'] }
);

const validPayment = fc.record(
  {
    patientId: objectId,
    amount: stellarAmount,
    destination: nonEmptyText,
    memo: fc.string({ maxLength: 28 }),
    currency: fc.constantFrom('XLM', 'USDC'),
    feeStrategy: fc.constantFrom('slow', 'standard', 'fast'),
    sponsorFee: fc.boolean(),
    idempotencyKey: fc.string({ minLength: 1, maxLength: 256 }),
  },
  { requiredKeys: ['amount', 'destination'] }
);

const validAppointment = fc.record(
  {
    patientId: nonEmptyText,
    doctorId: nonEmptyText,
    scheduledAt: isoDateTime,
    duration: fc.integer({ min: 1, max: 24 * 60 }),
    type: fc.constantFrom('consultation', 'follow-up', 'procedure', 'emergency'),
    chiefComplaint: fc.string({ unit: 'grapheme', maxLength: 200 }),
    notes: fc.string({ unit: 'grapheme', maxLength: 500 }),
  },
  { requiredKeys: ['patientId', 'doctorId', 'scheduledAt', 'type'] }
);

/** Keys that historically enable prototype pollution when merged naively. */
const pollutionKey = fc.constantFrom('__proto__', 'constructor', 'prototype', 'toString');

/**
 * Arbitrary request bodies: any JSON value, plus objects whose keys mix schema
 * fields, prototype-pollution keys and unicode, with huge / non-finite numbers.
 * Built via JSON.parse so `__proto__` ends up as an own property, exactly as
 * express.json() produces it.
 */
function hostileBody(fieldNames: string[]) {
  const value = fc.oneof(
    fc.jsonValue(),
    fc.string({ unit: 'binary' }),
    fc.constantFrom(1e308, -1e308, Number.MAX_SAFE_INTEGER + 2, -0, 0),
    fc.constant('9'.repeat(400))
  );
  const key = fc.oneof(fc.constantFrom(...fieldNames), pollutionKey, fc.string({ unit: 'binary' }));
  const object = fc.dictionary(key, value, { maxKeys: 12 });
  return fc
    .oneof(object, fc.jsonValue(), fc.array(object, { maxLength: 3 }))
    .map((v) => JSON.parse(JSON.stringify(v) ?? 'null'));
}

/** Hostile query strings: every value is a string, array of strings or nested object. */
function hostileQuery(fieldNames: string[]) {
  const value = fc.oneof(
    fc.string({ unit: 'binary' }),
    fc.constantFrom('1e308', '-1', 'NaN', 'Infinity', '9'.repeat(400), ''),
    fc.array(fc.string(), { maxLength: 3 })
  );
  const key = fc.oneof(fc.constantFrom(...fieldNames), pollutionKey);
  return fc
    .dictionary(key, value, { maxKeys: 8 })
    .map((v) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>);
}

// ── Harness ──────────────────────────────────────────────────────────────────

function runValidate(part: 'body' | 'query', schema: ZodSchema, input: unknown) {
  const req = {
    method: 'POST',
    path: '/property',
    requestId: 'prop-test',
    body: part === 'body' ? input : {},
    params: {},
    query: part === 'query' ? input : {},
  } as unknown as Request;
  let status: number | undefined;
  let payload: any;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    },
  } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;

  validateRequest({ [part]: schema })(req, res, next);
  return { status, payload, nextCalled: (next as unknown as jest.Mock).mock.calls.length > 0 };
}

function fieldsOf(schema: ZodSchema): string[] {
  const shape = (schema as any).shape ?? (schema as any)._def?.schema?.shape ?? {};
  return Object.keys(shape);
}

afterEach(() => {
  // A polluted prototype would leak into every object in the process.
  expect(({} as any).polluted).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'isAdmin')).toBe(false);
});

// ── Valid inputs are always accepted ─────────────────────────────────────────

describe('valid inputs are always accepted', () => {
  it.each([
    ['createPatientSchema', createPatientSchema, validPatient],
    ['createEncounterSchema', createEncounterSchema, validEncounter],
    ['createPaymentIntentSchema', createPaymentIntentSchema, validPayment],
    ['createAppointmentSchema', createAppointmentSchema, validAppointment],
  ] as const)('%s', (_name, schema, arb) => {
    fc.assert(
      fc.property(arb as fc.Arbitrary<unknown>, (input) => {
        const result = (schema as ZodSchema).safeParse(input);
        if (!result.success) throw new Error(JSON.stringify(result.error.issues));
        const handled = runValidate('body', schema as ZodSchema, input);
        expect(handled.nextCalled).toBe(true);
        expect(handled.status).toBeUndefined();
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('partial updates of valid records are accepted', () => {
    fc.assert(
      fc.property(validPatient, fc.integer({ min: 1, max: 6 }), (patient, n) => {
        const partial = Object.fromEntries(Object.entries(patient).slice(0, n));
        expect(updatePatientSchema.safeParse(partial).success).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
    fc.assert(
      fc.property(validAppointment, (appt) => {
        const { patientId: _p, doctorId: _d, ...update } = appt as Record<string, unknown>;
        expect(updateAppointmentSchema.safeParse(update).success).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
    fc.assert(
      fc.property(validEncounter, (enc) => {
        const { patientId: _p, clinicId: _c, attendingDoctorId: _a, ...update } = enc as Record<
          string,
          unknown
        >;
        expect(updateEncounterSchema.safeParse(update).success).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ── Invalid inputs never crash the handler ───────────────────────────────────

describe('arbitrary input never crashes validateRequest (only next() or 400)', () => {
  const bodySchemas: Array<[string, ZodSchema]> = [
    ['createPatientSchema', createPatientSchema],
    ['updatePatientSchema', updatePatientSchema],
    ['createEncounterSchema', createEncounterSchema],
    ['updateEncounterSchema', updateEncounterSchema],
    ['createPaymentIntentSchema', createPaymentIntentSchema],
    ['createAppointmentSchema', createAppointmentSchema],
    ['updateAppointmentSchema', updateAppointmentSchema],
  ];

  it.each(bodySchemas)('body: %s', (_name, schema) => {
    fc.assert(
      fc.property(hostileBody(fieldsOf(schema)), (body) => {
        const { status, payload, nextCalled } = runValidate('body', schema, body);
        if (nextCalled) {
          expect(status).toBeUndefined();
        } else {
          expect(status).toBe(400);
          expect(payload).toMatchObject({ error: 'ValidationError' });
          expect(Array.isArray(payload.details)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  const querySchemas: Array<[string, ZodSchema]> = [
    ['patientSearchQuerySchema', patientSearchQuerySchema],
    ['listPaymentsQuerySchema', listPaymentsQuerySchema],
    ['listAppointmentsQuerySchema', listAppointmentsQuerySchema],
  ];

  it.each(querySchemas)('query: %s', (_name, schema) => {
    fc.assert(
      fc.property(hostileQuery(fieldsOf(schema)), (query) => {
        const { status, nextCalled } = runValidate('query', schema, query);
        expect(nextCalled || status === 400).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('strips prototype-pollution keys instead of merging them', () => {
    const body = JSON.parse(
      '{"firstName":"Àdé","lastName":"Ọlá","dateOfBirth":"1990-01-01","sex":"F",' +
        '"__proto__":{"polluted":true,"isAdmin":true},"constructor":{"prototype":{"polluted":true}}}'
    );
    const req = { body, params: {}, query: {} } as unknown as Request;
    const next = jest.fn();
    validateRequest({ body: createPatientSchema })(req, {} as Response, next);

    expect(next).toHaveBeenCalled();
    expect(Object.prototype.hasOwnProperty.call(req.body, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(req.body, 'constructor')).toBe(false);
  });
});

// ── Regression cases found by the properties ─────────────────────────────────

describe('regressions', () => {
  it.each(['0', '00', '0.0', '0.0000000'])(
    'createPaymentIntentSchema rejects a zero amount (%s)',
    (amount) => {
      expect(createPaymentIntentSchema.safeParse({ amount, destination: 'G' }).success).toBe(false);
    }
  );

  it('rejects numeric bounds outside the encounter vitals range', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.double({ max: -Number.MIN_VALUE, noNaN: true }), fc.constant(0)),
        (heartRate) => {
          expect(
            createEncounterSchema.safeParse({
              patientId: 'a'.repeat(24),
              clinicId: 'b'.repeat(24),
              attendingDoctorId: 'c'.repeat(24),
              chiefComplaint: 'cough',
              vitalSigns: { heartRate },
            }).success
          ).toBe(false);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
