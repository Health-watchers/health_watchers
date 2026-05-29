/**
 * Tests for duplicate-detection fuzzy matching algorithms — Issue #641
 */
import { jaroWinkler, soundex, normalizePhone, DuplicateDetectionService } from './duplicate-detection.service';

// ── jaroWinkler ───────────────────────────────────────────────────────────────
describe('jaroWinkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('john', 'john')).toBe(1);
  });

  it('returns 0 for empty strings', () => {
    expect(jaroWinkler('', '')).toBe(0);
    expect(jaroWinkler('john', '')).toBe(0);
    expect(jaroWinkler('', 'john')).toBe(0);
  });

  it('detects John vs Jon as highly similar (>= 0.9)', () => {
    expect(jaroWinkler('john', 'jon')).toBeGreaterThanOrEqual(0.9);
  });

  it('detects Smyth vs Smith as highly similar (>= 0.85)', () => {
    expect(jaroWinkler('smyth', 'smith')).toBeGreaterThanOrEqual(0.85);
  });

  it('returns low similarity for completely different names', () => {
    expect(jaroWinkler('alice', 'robert')).toBeLessThan(0.6);
  });

  it('is case-sensitive (caller should lowercase)', () => {
    expect(jaroWinkler('John', 'john')).toBeLessThan(1);
    expect(jaroWinkler('john', 'john')).toBe(1);
  });

  it('detects Catherine vs Katherine as similar (>= 0.85)', () => {
    expect(jaroWinkler('catherine', 'katherine')).toBeGreaterThanOrEqual(0.85);
  });
});

// ── soundex ───────────────────────────────────────────────────────────────────
describe('soundex', () => {
  it('returns 4-character code', () => {
    expect(soundex('Smith')).toHaveLength(4);
    expect(soundex('Johnson')).toHaveLength(4);
  });

  it('Smith and Smyth share the same soundex code', () => {
    expect(soundex('Smith')).toBe(soundex('Smyth'));
  });

  it('Robert and Rupert share the same soundex code', () => {
    expect(soundex('Robert')).toBe(soundex('Rupert'));
  });

  it('returns 0000 for empty/non-alpha input', () => {
    expect(soundex('')).toBe('0000');
    expect(soundex('123')).toBe('0000');
  });

  it('different names produce different codes', () => {
    expect(soundex('Smith')).not.toBe(soundex('Jones'));
  });
});

// ── normalizePhone ────────────────────────────────────────────────────────────
describe('normalizePhone', () => {
  it('strips dashes, spaces, and parentheses', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567');
  });

  it('strips dots', () => {
    expect(normalizePhone('555.123.4567')).toBe('5551234567');
  });

  it('strips country code prefix', () => {
    expect(normalizePhone('+1-555-123-4567')).toBe('15551234567');
  });

  it('leaves digits-only string unchanged', () => {
    expect(normalizePhone('5551234567')).toBe('5551234567');
  });

  it('two differently formatted same numbers are equal after normalization', () => {
    expect(normalizePhone('(555) 123-4567')).toBe(normalizePhone('555-123-4567'));
  });
});

// ── DuplicateDetectionService.checkDuplicates (unit, mocked DB) ───────────────
jest.mock('./models/patient.model', () => ({
  PatientModel: {
    find: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

import { PatientModel } from './models/patient.model';
import { Types } from 'mongoose';

const CLINIC_ID = new Types.ObjectId().toString();

function makePatient(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    firstName: 'John',
    lastName: 'Smith',
    dateOfBirth: '1990-05-15',
    contactNumber: '555-1234',
    isActive: true,
    ...overrides,
  };
}

describe('DuplicateDetectionService.checkDuplicates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('detects exact match with confidence 100', async () => {
    const patient = makePatient();
    (PatientModel.find as jest.Mock).mockReturnValue({ lean: () => Promise.resolve([patient]) });

    const results = await DuplicateDetectionService.checkDuplicates(
      'John', 'Smith', '1990-05-15', CLINIC_ID
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchType).toBe('exact');
    expect(results[0].confidence).toBe(100);
  });

  it('detects Jon Smyth as duplicate of John Smith (fuzzy)', async () => {
    const patient = makePatient({ firstName: 'John', lastName: 'Smith' });
    (PatientModel.find as jest.Mock).mockReturnValue({ lean: () => Promise.resolve([patient]) });

    const results = await DuplicateDetectionService.checkDuplicates(
      'Jon', 'Smyth', '1990-05-15', CLINIC_ID
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confidence).toBeGreaterThanOrEqual(60);
  });

  it('returns empty array when no candidates share DOB ±1 day', async () => {
    (PatientModel.find as jest.Mock).mockReturnValue({ lean: () => Promise.resolve([]) });

    const results = await DuplicateDetectionService.checkDuplicates(
      'John', 'Smith', '1990-05-15', CLINIC_ID
    );

    expect(results).toHaveLength(0);
  });

  it('includes DOB ±1 day candidates', async () => {
    // Patient has DOB one day off
    const patient = makePatient({ dateOfBirth: '1990-05-14' });
    (PatientModel.find as jest.Mock).mockReturnValue({ lean: () => Promise.resolve([patient]) });

    const results = await DuplicateDetectionService.checkDuplicates(
      'John', 'Smith', '1990-05-15', CLINIC_ID
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchReasons.some((r) => r.includes('±1 day'))).toBe(true);
  });

  it('results are sorted by confidence descending', async () => {
    const patients = [
      makePatient({ firstName: 'Jon', lastName: 'Smyth' }),   // lower similarity
      makePatient({ firstName: 'John', lastName: 'Smith' }),  // exact
    ];
    (PatientModel.find as jest.Mock).mockReturnValue({ lean: () => Promise.resolve(patients) });

    const results = await DuplicateDetectionService.checkDuplicates(
      'John', 'Smith', '1990-05-15', CLINIC_ID
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].confidence).toBeGreaterThanOrEqual(results[i].confidence);
    }
  });

  it('excludes candidates with very different names', async () => {
    const patient = makePatient({ firstName: 'Alice', lastName: 'Johnson' });
    (PatientModel.find as jest.Mock).mockReturnValue({ lean: () => Promise.resolve([patient]) });

    const results = await DuplicateDetectionService.checkDuplicates(
      'John', 'Smith', '1990-05-15', CLINIC_ID
    );

    expect(results).toHaveLength(0);
  });
});

// ── DuplicateDetectionService.findPotentialDuplicates ─────────────────────────
describe('DuplicateDetectionService.findPotentialDuplicates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a pair for John Smith / Jon Smyth with same DOB', async () => {
    const patients = [
      makePatient({ _id: new Types.ObjectId(), firstName: 'John', lastName: 'Smith', dateOfBirth: '1990-05-15' }),
      makePatient({ _id: new Types.ObjectId(), firstName: 'Jon', lastName: 'Smyth', dateOfBirth: '1990-05-15' }),
    ];
    (PatientModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: () => Promise.resolve(patients),
    });

    const pairs = await DuplicateDetectionService.findPotentialDuplicates(CLINIC_ID, 50);

    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].confidence).toBeGreaterThanOrEqual(50);
  });

  it('returns empty array when no patients share similar names + DOB', async () => {
    const patients = [
      makePatient({ _id: new Types.ObjectId(), firstName: 'Alice', lastName: 'Brown', dateOfBirth: '1985-01-01' }),
      makePatient({ _id: new Types.ObjectId(), firstName: 'Robert', lastName: 'Jones', dateOfBirth: '1990-05-15' }),
    ];
    (PatientModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: () => Promise.resolve(patients),
    });

    const pairs = await DuplicateDetectionService.findPotentialDuplicates(CLINIC_ID, 60);

    expect(pairs).toHaveLength(0);
  });

  it('boosts confidence when phone numbers match', async () => {
    const patients = [
      makePatient({ _id: new Types.ObjectId(), firstName: 'John', lastName: 'Smith', dateOfBirth: '1990-05-15', contactNumber: '555-1234' }),
      makePatient({ _id: new Types.ObjectId(), firstName: 'Jon', lastName: 'Smyth', dateOfBirth: '1990-05-15', contactNumber: '(555) 1234' }),
    ];
    (PatientModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: () => Promise.resolve(patients),
    });

    const pairs = await DuplicateDetectionService.findPotentialDuplicates(CLINIC_ID, 50);

    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].matchReasons).toContain('matching phone number');
  });

  it('pairs are sorted by confidence descending', async () => {
    const patients = [
      makePatient({ _id: new Types.ObjectId(), firstName: 'John', lastName: 'Smith', dateOfBirth: '1990-05-15' }),
      makePatient({ _id: new Types.ObjectId(), firstName: 'Jon', lastName: 'Smyth', dateOfBirth: '1990-05-15' }),
      makePatient({ _id: new Types.ObjectId(), firstName: 'John', lastName: 'Smith', dateOfBirth: '1990-05-15' }),
    ];
    (PatientModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: () => Promise.resolve(patients),
    });

    const pairs = await DuplicateDetectionService.findPotentialDuplicates(CLINIC_ID, 50);

    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1].confidence).toBeGreaterThanOrEqual(pairs[i].confidence);
    }
  });
});
