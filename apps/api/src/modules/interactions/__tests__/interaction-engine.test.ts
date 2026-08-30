import {
  normalizeDrugName,
  resolveDrug,
  resolveDrugs,
  detectDrugDrugInteractions,
  detectAllergyInteractions,
  detectFoodInteractions,
  checkMedicationSafety,
  classifySeverity,
  buildSafetySummary,
  buildInteractionExplanation,
  severityLabel,
} from '../interaction-engine';
import { INTERACTION_DATA } from '../interaction-data';

describe('normalizeDrugName', () => {
  it('lowercases and strips strength/parentheticals', () => {
    expect(normalizeDrugName('Warfarin 5mg Tablet')).toBe('warfarin');
    expect(normalizeDrugName('Lipitor (Atorvastatin) 20 mg')).toBe('lipitor');
    expect(normalizeDrugName('  Aspirin  81mg  ')).toBe('aspirin');
  });
});

describe('resolveDrug', () => {
  it('resolves generic names', () => {
    const drug = resolveDrug('warfarin');
    expect(drug?.genericName).toBe('warfarin');
    expect(drug?.rxCui).toBe('11289');
  });

  it('resolves brand names to the generic', () => {
    const drug = resolveDrug('Coumadin');
    expect(drug?.genericName).toBe('warfarin');
  });

  it('resolves synonyms', () => {
    const drug = resolveDrug('acetylsalicylic acid');
    expect(drug?.genericName).toBe('aspirin');
  });

  it('resolves strength-qualified strings', () => {
    const drug = resolveDrug('Clopidogrel 75 mg Tablet');
    expect(drug?.genericName).toBe('clopidogrel');
  });

  it('returns null for unknown drugs', () => {
    expect(resolveDrug('florphenazine')).toBeNull();
  });
});

describe('resolveDrugs', () => {
  it('deduplicates by generic name', () => {
    const resolved = resolveDrugs(['warfarin', 'Coumadin', 'aspirin']);
    expect(resolved.map((d) => d.genericName)).toEqual(['warfarin', 'aspirin']);
  });

  it('drops unresolvable entries', () => {
    const resolved = resolveDrugs(['warfarin', 'unknown-drug-xyz']);
    expect(resolved.map((d) => d.genericName)).toEqual(['warfarin']);
  });
});

describe('detectDrugDrugInteractions', () => {
  it('detects a critical interaction', () => {
    const resolved = resolveDrugs(['sildenafil', 'nitroglycerin']);
    const interactions = detectDrugDrugInteractions(resolved);
    expect(interactions).toHaveLength(1);
    expect(interactions[0].severity).toBe('critical');
    expect(interactions[0].explanation).toContain('critical');
  });

  it('is order-insensitive', () => {
    const a = detectDrugDrugInteractions(resolveDrugs(['sildenafil', 'nitroglycerin']));
    const b = detectDrugDrugInteractions(resolveDrugs(['nitroglycerin', 'sildenafil']));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].drugA).toBe('sildenafil');
    expect(b[0].drugA).toBe('sildenafil');
  });

  it('detects multiple interactions across a list', () => {
    const resolved = resolveDrugs([
      'warfarin',
      'aspirin',
      'ibuprofen',
      'simvastatin',
      'clarithromycin',
    ]);
    const interactions = detectDrugDrugInteractions(resolved);
    expect(interactions.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty for a safe list', () => {
    const resolved = resolveDrugs(['metformin', 'atorvastatin']);
    expect(detectDrugDrugInteractions(resolved)).toHaveLength(0);
  });
});

describe('detectAllergyInteractions', () => {
  it('flags a matching drug allergy', () => {
    const results = detectAllergyInteractions('amoxicillin', [
      { allergen: 'amoxicillin', severity: 'severe' },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe('severe');
    expect(results[0].explanation).toContain('amoxicillin');
  });

  it('flags brand-name allergy match', () => {
    const results = detectAllergyInteractions('Xanax', [{ allergen: 'alprazolam' }]);
    expect(results).toHaveLength(1);
  });

  it('returns empty when no allergy matches', () => {
    const results = detectAllergyInteractions('metformin', [{ allergen: 'penicillin' }]);
    expect(results).toHaveLength(0);
  });

  it('defaults severity to moderate when unspecified', () => {
    const results = detectAllergyInteractions('amoxicillin', [{ allergen: 'amoxicillin' }]);
    expect(results[0].severity).toBe('moderate');
  });
});

describe('detectFoodInteractions', () => {
  it('flags grapefruit juice for simvastatin', () => {
    const results = detectFoodInteractions('simvastatin');
    expect(results.some((r) => r.food === 'grapefruit juice')).toBe(true);
    expect(results[0].severity).toBe('major');
  });

  it('returns empty for drugs without food warnings', () => {
    expect(detectFoodInteractions('metformin').some((r) => r.food === 'grapefruit juice')).toBe(
      false
    );
  });
});

describe('classifySeverity', () => {
  it('returns none for empty set', () => {
    expect(classifySeverity([])).toBe('none');
  });

  it('returns the highest severity present', () => {
    expect(classifySeverity([{ severity: 'moderate' }, { severity: 'critical' }])).toBe('critical');
    expect(classifySeverity([{ severity: 'minor' }, { severity: 'major' }])).toBe('major');
  });
});

describe('buildSafetySummary', () => {
  it('reports no interactions', () => {
    expect(buildSafetySummary('none', 0, 0, 0)).toContain('No medication interactions');
  });

  it('enumerates interaction categories', () => {
    const summary = buildSafetySummary('major', 2, 1, 0);
    expect(summary).toContain('3');
    expect(summary).toContain('drug-drug');
    expect(summary).toContain('allergy');
  });
});

describe('buildInteractionExplanation', () => {
  it('includes both drugs, severity label, mechanism, and management', () => {
    const explanation = buildInteractionExplanation(
      'sildenafil',
      'nitroglycerin',
      'critical',
      'Additive vasodilation.',
      'Do not co-administer.'
    );
    expect(explanation).toContain('sildenafil and nitroglycerin');
    expect(explanation).toContain(severityLabel('critical'));
    expect(explanation).toContain('Additive vasodilation.');
    expect(explanation).toContain('Do not co-administer.');
  });
});

describe('checkMedicationSafety', () => {
  it('full check combines all interaction types', () => {
    const result = checkMedicationSafety({
      medications: ['sildenafil', 'nitroglycerin', 'simvastatin', 'amoxicillin'],
      allergies: [{ allergen: 'amoxicillin', severity: 'life-threatening' }],
      includeFood: true,
    });
    expect(result.severity).toBe('critical');
    expect(result.drugDrugInteractions.length).toBeGreaterThanOrEqual(1);
    expect(result.allergyInteractions).toHaveLength(1);
    expect(result.foodInteractions.length).toBeGreaterThanOrEqual(1);
  });

  it('skips food checks when includeFood is false', () => {
    const result = checkMedicationSafety({
      medications: ['simvastatin'],
      includeFood: false,
    });
    expect(result.foodInteractions).toHaveLength(0);
  });

  it('is deterministic given the same input', () => {
    const a = checkMedicationSafety({ medications: ['warfarin', 'aspirin'] });
    const b = checkMedicationSafety({ medications: ['warfarin', 'aspirin'] });
    expect(a).toEqual(b);
  });

  it('covers every critical interaction in the dataset', () => {
    // Acceptance criterion: "detects all critical interactions" — verify each
    // critical pair in the data is detected when both drugs are present.
    for (const record of INTERACTION_DATA.filter((r) => r.severity === 'critical')) {
      const result = checkMedicationSafety({
        medications: [record.drugA, record.drugB],
        includeFood: false,
      });
      const detected = result.drugDrugInteractions.some(
        (i) =>
          (i.drugA === record.drugA && i.drugB === record.drugB) ||
          (i.drugA === record.drugB && i.drugB === record.drugA)
      );
      expect(detected).toBe(true);
    }
  });
});
