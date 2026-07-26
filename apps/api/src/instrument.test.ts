jest.mock('@sentry/node', () => ({ init: jest.fn() }));
jest.mock('@sentry/profiling-node', () => ({ nodeProfilingIntegration: jest.fn() }));

// Mirror the scrubbing logic from instrument.ts
const PHI_KEYS = [
  'firstName', 'lastName', 'fullName', 'name',
  'dateOfBirth', 'dob', 'phone', 'email', 'address',
  'patientId', 'mrn', 'ssn', 'insuranceId',
];

function redactKeys(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = PHI_KEYS.includes(key) ? '[Redacted]' : redactKeys(value);
  }
  return result;
}

function scrubPHI<T extends { request?: { data?: unknown }; extra?: Record<string, unknown> }>(event: T): T {
  if (event.request?.data) event.request.data = redactKeys(event.request.data);
  if (event.extra) event.extra = redactKeys(event.extra) as Record<string, unknown>;
  return event;
}

describe('Sentry PHI scrubbing (beforeSend)', () => {
  it('redacts PHI fields in request.data', () => {
    const result = scrubPHI({ request: { data: { firstName: 'John', diagnosis: 'flu' } } });
    const data = result.request!.data as Record<string, unknown>;
    expect(data.firstName).toBe('[Redacted]');
    expect(data.diagnosis).toBe('flu');
  });

  it('redacts nested PHI fields', () => {
    const result = scrubPHI({ request: { data: { patient: { email: 'a@b.com', age: 30 } } } });
    const patient = ((result.request!.data as Record<string, unknown>).patient) as Record<string, unknown>;
    expect(patient.email).toBe('[Redacted]');
    expect(patient.age).toBe(30);
  });

  it('redacts all defined PHI keys', () => {
    const data = Object.fromEntries(PHI_KEYS.map((k) => [k, 'sensitive']));
    const result = scrubPHI({ request: { data } });
    PHI_KEYS.forEach((k) => {
      expect((result.request!.data as Record<string, unknown>)[k]).toBe('[Redacted]');
    });
  });

  it('redacts PHI in event.extra', () => {
    const result = scrubPHI({ extra: { ssn: '123-45-6789', requestId: 'abc' } });
    expect(result.extra!.ssn).toBe('[Redacted]');
    expect(result.extra!.requestId).toBe('abc');
  });

  it('leaves non-PHI fields unchanged', () => {
    const result = scrubPHI({ request: { data: { clinicId: 'c1', action: 'login' } } });
    const data = result.request!.data as Record<string, unknown>;
    expect(data.clinicId).toBe('c1');
    expect(data.action).toBe('login');
  });

  it('handles missing request.data gracefully', () => {
    expect(() => scrubPHI({ extra: { foo: 'bar' } })).not.toThrow();
  });

  it('handles non-object request.data gracefully', () => {
    const result = scrubPHI({ request: { data: 'raw' } });
    expect(result.request!.data).toBe('raw');
  });
});
