import cdsRulesEngine from '../cds-rules-engine';
import { CDSRuleModel } from '../cds-rule.model';
import { PatientModel } from '../../patients/models/patient.model';

jest.mock('../cds-rule.model', () => ({ CDSRuleModel: { find: jest.fn() } }));
jest.mock('../../patients/models/patient.model', () => ({ PatientModel: { findById: jest.fn() } }));

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: 'rule-1',
    conditions: {},
    action: { type: 'alert', message: 'Alert!', severity: 'warning' },
    ...overrides,
  };
}

describe('CDSRulesEngine.evaluateRules', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns an empty list when no rules match', async () => {
    (CDSRuleModel.find as jest.Mock).mockResolvedValue([]);

    const alerts = await cdsRulesEngine.evaluateRules('encounter_create', {
      patientId: 'p1' as any,
      clinicId: 'c1' as any,
    });

    expect(alerts).toEqual([]);
  });

  it('fires a critical vital-sign alert for hypertensive crisis blood pressure', async () => {
    (CDSRuleModel.find as jest.Mock).mockResolvedValue([
      makeRule({
        conditions: { type: 'vital_sign', bloodPressure: { critical: true } },
        action: { type: 'alert', message: 'Hypertensive crisis', severity: 'critical' },
      }),
    ]);

    const alerts = await cdsRulesEngine.evaluateRules('vital_sign_record', {
      patientId: 'p1' as any,
      clinicId: 'c1' as any,
      vitalSigns: { bloodPressure: '190/125' } as any,
    });

    expect(alerts).toEqual([
      { ruleId: 'rule-1', severity: 'critical', message: 'Hypertensive crisis', action: 'alert' },
    ]);
  });

  it('does not fire the vital-sign rule when readings are within range', async () => {
    (CDSRuleModel.find as jest.Mock).mockResolvedValue([
      makeRule({ conditions: { type: 'vital_sign', bloodPressure: { critical: true } } }),
    ]);

    const alerts = await cdsRulesEngine.evaluateRules('vital_sign_record', {
      patientId: 'p1' as any,
      clinicId: 'c1' as any,
      vitalSigns: { bloodPressure: '110/70' } as any,
    });

    expect(alerts).toEqual([]);
  });

  it('fires a drug interaction alert for a contraindicated prescription', async () => {
    (CDSRuleModel.find as jest.Mock).mockResolvedValue([
      makeRule({ conditions: { type: 'drug_interaction', contraindications: ['warfarin'] } }),
    ]);

    const alerts = await cdsRulesEngine.evaluateRules('prescription_add', {
      patientId: 'p1' as any,
      clinicId: 'c1' as any,
      prescription: { drugName: 'Warfarin' } as any,
    });

    expect(alerts).toHaveLength(1);
  });

  it('fires an allergy alert for a moderate+ severity match, but not for mild', async () => {
    (CDSRuleModel.find as jest.Mock).mockResolvedValue([
      makeRule({ conditions: { type: 'allergy', allergenType: 'drug' } }),
    ]);

    const context = {
      patientId: 'p1' as any,
      clinicId: 'c1' as any,
      prescription: { drugName: 'Penicillin' } as any,
      allergies: [{ allergen: 'Penicillin', severity: 'severe' }],
    };

    const alerts = await cdsRulesEngine.evaluateRules('prescription_add', context);
    expect(alerts).toHaveLength(1);

    const mildAlerts = await cdsRulesEngine.evaluateRules('prescription_add', {
      ...context,
      allergies: [{ allergen: 'Penicillin', severity: 'mild' }],
    });
    expect(mildAlerts).toEqual([]);
  });

  it('applies age and sex constraints for screening rules', async () => {
    (CDSRuleModel.find as jest.Mock).mockResolvedValue([
      makeRule({
        conditions: { type: 'screening', minAge: 50, maxAge: 75, requiredSex: 'female' },
      }),
    ]);

    const tooYoung = await cdsRulesEngine.evaluateRules('encounter_create', {
      patientId: 'p1' as any,
      clinicId: 'c1' as any,
      patientAge: 30,
      patientSex: 'female',
    });
    expect(tooYoung).toEqual([]);

    const wrongSex = await cdsRulesEngine.evaluateRules('encounter_create', {
      patientId: 'p1' as any,
      clinicId: 'c1' as any,
      patientAge: 60,
      patientSex: 'male',
    });
    expect(wrongSex).toEqual([]);

    const eligible = await cdsRulesEngine.evaluateRules('encounter_create', {
      patientId: 'p1' as any,
      clinicId: 'c1' as any,
      patientAge: 60,
      patientSex: 'female',
    });
    expect(eligible).toHaveLength(1);
  });

  it('returns an empty list and logs when the rule lookup throws', async () => {
    (CDSRuleModel.find as jest.Mock).mockRejectedValue(new Error('db down'));

    const alerts = await cdsRulesEngine.evaluateRules('encounter_create', {
      patientId: 'p1' as any,
      clinicId: 'c1' as any,
    });

    expect(alerts).toEqual([]);
  });
});

describe('CDSRulesEngine.getPatientContext', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns an empty object when the patient is not found', async () => {
    (PatientModel.findById as jest.Mock).mockResolvedValue(null);
    expect(await cdsRulesEngine.getPatientContext('p1' as any, 'c1' as any)).toEqual({});
  });

  it('computes age and maps active allergies', async () => {
    const currentYear = new Date().getFullYear();
    (PatientModel.findById as jest.Mock).mockResolvedValue({
      dateOfBirth: new Date(`${currentYear - 40}-01-01`),
      sex: 'male',
      allergies: [
        { allergen: 'Penicillin', severity: 'severe', isActive: true },
        { allergen: 'Latex', severity: 'mild', isActive: false },
      ],
    });

    const context = await cdsRulesEngine.getPatientContext('p1' as any, 'c1' as any);

    expect(context.patientAge).toBe(40);
    expect(context.patientSex).toBe('male');
    expect(context.allergies).toEqual([{ allergen: 'Penicillin', severity: 'severe' }]);
  });

  it('returns an empty object when the lookup throws', async () => {
    (PatientModel.findById as jest.Mock).mockRejectedValue(new Error('db down'));
    expect(await cdsRulesEngine.getPatientContext('p1' as any, 'c1' as any)).toEqual({});
  });
});
