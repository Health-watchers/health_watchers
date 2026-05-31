import { canTransition, assertValidTransition } from '../billing-workflow';
import { buildAgingReport } from '../billing-aging';

describe('canTransition', () => {
  it('unbilled → billed is allowed', () => {
    expect(canTransition('unbilled', 'billed').allowed).toBe(true);
  });
  it('billed → paid is allowed', () => {
    expect(canTransition('billed', 'paid').allowed).toBe(true);
  });
  it('billed → denied is allowed', () => {
    expect(canTransition('billed', 'denied').allowed).toBe(true);
  });
  it('denied → resubmitted is allowed', () => {
    expect(canTransition('denied', 'resubmitted').allowed).toBe(true);
  });
  it('resubmitted → billed is allowed', () => {
    expect(canTransition('resubmitted', 'billed').allowed).toBe(true);
  });
  it('unbilled → paid is NOT allowed', () => {
    const result = canTransition('unbilled', 'paid');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('"unbilled" → "paid"');
  });
  it('paid → billed is NOT allowed', () => {
    expect(canTransition('paid', 'billed').allowed).toBe(false);
  });
  it('denied → paid is NOT allowed', () => {
    expect(canTransition('denied', 'paid').allowed).toBe(false);
  });
  it('billed → unbilled is NOT allowed', () => {
    expect(canTransition('billed', 'unbilled').allowed).toBe(false);
  });
});

describe('assertValidTransition', () => {
  it('does not throw for valid transition', () => {
    expect(() => assertValidTransition('unbilled', 'billed')).not.toThrow();
  });
  it('throws with statusCode 400 for invalid transition', () => {
    try {
      assertValidTransition('paid', 'billed');
      fail('should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('"paid" → "billed"');
    }
  });
});

describe('buildAgingReport', () => {
  const makeEntry = (daysAgo: number) => {
    const serviceDate = new Date();
    serviceDate.setDate(serviceDate.getDate() - daysAgo);
    return { encounterId: `enc_${daysAgo}`, patientId: 'p1', serviceDate };
  };

  it('places 15-day encounter in 0–30 bucket', () => {
    const report = buildAgingReport([makeEntry(15)]);
    expect(report[0].encounters).toHaveLength(1);
    expect(report[0].encounters[0].daysUnbilled).toBe(15);
  });
  it('places 45-day encounter in 31–60 bucket', () => {
    const report = buildAgingReport([makeEntry(45)]);
    expect(report[1].encounters).toHaveLength(1);
  });
  it('places 100-day encounter in >90 bucket', () => {
    const report = buildAgingReport([makeEntry(100)]);
    expect(report[3].encounters).toHaveLength(1);
  });
  it('returns empty buckets when no entries provided', () => {
    const report = buildAgingReport([]);
    report.forEach(b => expect(b.encounters).toHaveLength(0));
  });
});
