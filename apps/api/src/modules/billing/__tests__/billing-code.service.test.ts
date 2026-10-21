import {
  matchCptFromCatalog,
  matchSnomedForDiagnosis,
  assignBillingCodes,
} from '../billing-code.service';

jest.mock('../../cpt/cpt.model', () => ({
  CPTModel: { findOne: jest.fn() },
}));

describe('matchCptFromCatalog', () => {
  it('matches established patient low-complexity visit to 99213', () => {
    const match = matchCptFromCatalog('established patient office visit low complexity');
    expect(match?.code).toBe('99213');
    expect(match?.defaultFee).toBe('110.00');
  });

  it('matches new patient moderate complexity visit to 99203', () => {
    const match = matchCptFromCatalog('new patient office visit moderate complexity');
    expect(match?.code).toBe('99203');
  });

  it('matches electrocardiogram to 93000', () => {
    const match = matchCptFromCatalog('electrocardiogram');
    expect(match?.code).toBe('93000');
  });

  it('matches blood draw to venipuncture 36415', () => {
    const match = matchCptFromCatalog('blood draw');
    expect(match?.code).toBe('36415');
  });

  it('returns null for empty input', () => {
    expect(matchCptFromCatalog('')).toBeNull();
    expect(matchCptFromCatalog('   ')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(matchCptFromCatalog('xyzzy quantum entanglement procedure')).toBeNull();
  });

  it('reports confidence between 0 and 1', () => {
    const match = matchCptFromCatalog('chest x ray two views');
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeGreaterThan(0);
    expect(match!.confidence).toBeLessThanOrEqual(1);
  });
});

describe('matchSnomedForDiagnosis', () => {
  it('maps ICD-10 E11.9 to type 2 diabetes SNOMED concept', () => {
    const match = matchSnomedForDiagnosis({ code: 'E11.9', description: 'Type 2 diabetes' });
    expect(match?.code).toBe('44054006');
    expect(match?.confidence).toBe(1);
  });

  it('maps ICD-10 I10 to essential hypertension', () => {
    const match = matchSnomedForDiagnosis({ code: 'I10', description: 'Hypertension' });
    expect(match?.code).toBe('38341003');
  });

  it('falls back to keyword matching on description', () => {
    const match = matchSnomedForDiagnosis({
      code: 'R51',
      description: 'Patient reports severe headache',
    });
    expect(match?.code).toBe('25064002');
  });

  it('returns null when nothing matches', () => {
    const match = matchSnomedForDiagnosis({ code: 'ZZZ', description: 'unmappable condition' });
    expect(match).toBeNull();
  });
});

describe('assignBillingCodes', () => {
  it('assigns both CPT and SNOMED codes', async () => {
    const assignment = await assignBillingCodes({
      diagnoses: [{ code: 'E11.9', description: 'Type 2 diabetes' }],
      procedures: ['established patient office visit low complexity', 'electrocardiogram'],
    });

    expect(assignment.cptCodes.map((c) => c.code)).toEqual(['99213', '93000']);
    expect(assignment.snomedCodes.map((s) => s.code)).toEqual(['44054006']);
    expect(assignment.assignedAt).toBeTruthy();
  });

  it('handles empty input', async () => {
    const assignment = await assignBillingCodes({});
    expect(assignment.cptCodes).toEqual([]);
    expect(assignment.snomedCodes).toEqual([]);
  });
});
