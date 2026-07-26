import { encrypt, decrypt } from './encrypt';

const TEST_KEY = 'a'.repeat(64);

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
  process.env.FIELD_ENCRYPTION_KEY_VERSION = '1';
});

const SHORT = 'John Doe';
const MEDIUM = '123 Main Street, Springfield, IL 62701';
const LONG = 'A'.repeat(1000);

const ITERATIONS = 1000;
const MAX_OPS_PER_MS = 0.5; // allow up to 2 ms per operation on average

function bench(label: string, fn: () => void, iterations = ITERATIONS): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const msPerOp = elapsed / iterations;
  console.log(
    `  ${label}: ${msPerOp.toFixed(3)} ms/op (${iterations} iterations, ${elapsed.toFixed(1)} ms total)`
  );
  return msPerOp;
}

describe('encrypt/decrypt performance', () => {
  it('encrypts short PHI strings within budget', () => {
    const msPerOp = bench('encrypt (short)', () => encrypt(SHORT));
    expect(msPerOp).toBeLessThan(MAX_OPS_PER_MS * 4);
  });

  it('encrypts medium-length strings within budget', () => {
    const msPerOp = bench('encrypt (medium)', () => encrypt(MEDIUM));
    expect(msPerOp).toBeLessThan(MAX_OPS_PER_MS * 4);
  });

  it('encrypts 1 KB strings within budget', () => {
    const msPerOp = bench('encrypt (1 KB)', () => encrypt(LONG));
    expect(msPerOp).toBeLessThan(MAX_OPS_PER_MS * 8);
  });

  it('decrypts short ciphertext within budget', () => {
    const ct = encrypt(SHORT);
    const msPerOp = bench('decrypt (short)', () => decrypt(ct));
    expect(msPerOp).toBeLessThan(MAX_OPS_PER_MS * 4);
  });

  it('decrypts medium ciphertext within budget', () => {
    const ct = encrypt(MEDIUM);
    const msPerOp = bench('decrypt (medium)', () => decrypt(ct));
    expect(msPerOp).toBeLessThan(MAX_OPS_PER_MS * 4);
  });

  it('round-trip throughput is sufficient for bulk PHI field updates', () => {
    const BULK = 500;
    const start = performance.now();
    for (let i = 0; i < BULK; i++) {
      decrypt(encrypt(`Patient record ${i} — ${MEDIUM}`));
    }
    const elapsed = performance.now() - start;
    const msPerRoundTrip = elapsed / BULK;
    console.log(`  round-trip (${BULK} records): ${msPerRoundTrip.toFixed(3)} ms/record`);
    // Should handle bulk updates without becoming a bottleneck
    expect(msPerRoundTrip).toBeLessThan(5);
  });
});
