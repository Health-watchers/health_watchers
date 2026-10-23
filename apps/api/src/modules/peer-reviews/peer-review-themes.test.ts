import { extractThemes, summariseThemes } from './peer-review-themes';

describe('extractThemes', () => {
  it('matches themes case-insensitively', () => {
    expect(extractThemes('Incomplete SOAP NOTE; consider a Differential')).toEqual(
      expect.arrayContaining(['documentation', 'diagnosis'])
    );
  });

  it('returns an empty list for empty input', () => {
    expect(extractThemes(undefined)).toEqual([]);
    expect(extractThemes('')).toEqual([]);
  });
});

describe('summariseThemes', () => {
  it('counts each theme once per review and sorts by frequency', () => {
    const result = summariseThemes([
      { feedback: 'Missing documentation', recommendations: 'Improve SOAP note detail' },
      { feedback: 'Dosage of the antibiotic was too high' },
      { feedback: 'Notes incomplete', recommendations: 'Arrange follow-up' },
    ]);
    expect(result[0]).toMatchObject({ key: 'documentation', count: 2 });
    expect(result.find((t) => t.key === 'prescribing')?.count).toBe(1);
    expect(result[0].share).toBeCloseTo(2 / 3);
  });

  it('respects the limit', () => {
    const result = summariseThemes(
      [{ feedback: 'documentation history exam diagnosis lab dose guideline' }],
      3
    );
    expect(result).toHaveLength(3);
  });
});
