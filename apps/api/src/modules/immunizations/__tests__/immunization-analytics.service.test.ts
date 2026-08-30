import { getImmunizationAnalytics } from '../immunization-analytics.service';

jest.mock('../immunization.model', () => ({
  ImmunizationModel: {
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('../../patients/models/patient.model', () => ({
  PatientModel: { find: jest.fn() },
}));

jest.mock('../adverse-event.model', () => ({
  VaccineAdverseEventModel: { find: jest.fn() },
}));

jest.mock('../vaccine-lot.model', () => ({
  VaccineLotModel: { find: jest.fn() },
}));

import { ImmunizationModel } from '../immunization.model';
import { PatientModel } from '../../patients/models/patient.model';
import { VaccineAdverseEventModel } from '../adverse-event.model';
import { VaccineLotModel } from '../vaccine-lot.model';

const CLINIC_ID = '507f1f77bcf86cd799439011';
const PATIENT_ID = '507f1f77bcf86cd799439012';

const FROM = new Date('2025-01-01');
const TO = new Date('2026-01-01');

function mockPatientLookup(patients: unknown[]) {
  (PatientModel.find as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(patients),
    }),
  });
}

function mockFindWithLean(model: { find: jest.Mock }, rows: unknown[]) {
  (model.find as jest.Mock).mockReturnValue({
    lean: jest.fn().mockResolvedValue(rows),
  });
}

describe('getImmunizationAnalytics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns zeroed analytics for an empty clinic', async () => {
    (ImmunizationModel.countDocuments as jest.Mock).mockResolvedValue(0);
    (ImmunizationModel.aggregate as jest.Mock).mockResolvedValue([]);
    (ImmunizationModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
    mockPatientLookup([]);
    mockFindWithLean(VaccineAdverseEventModel, []);
    mockFindWithLean(VaccineLotModel, []);

    const analytics = await getImmunizationAnalytics(CLINIC_ID, FROM, TO);

    expect(analytics.totalDosesAdministered).toBe(0);
    expect(analytics.dosesByVaccine).toEqual([]);
    expect(analytics.dosesOverTime).toEqual([]);
    expect(analytics.adverseEvents.total).toBe(0);
    expect(analytics.lotInventory.totalLots).toBe(0);
  });

  it('aggregates doses by vaccine and over time', async () => {
    (ImmunizationModel.countDocuments as jest.Mock).mockResolvedValue(3);
    (ImmunizationModel.aggregate as jest.Mock)
      .mockResolvedValueOnce([{ _id: '03', vaccineName: 'MMR', count: 2 }])
      .mockResolvedValueOnce([{ _id: '2025-06', count: 3 }]);
    (ImmunizationModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
    mockPatientLookup([]);
    mockFindWithLean(VaccineAdverseEventModel, []);
    mockFindWithLean(VaccineLotModel, []);

    const analytics = await getImmunizationAnalytics(CLINIC_ID, FROM, TO);

    expect(analytics.totalDosesAdministered).toBe(3);
    expect(analytics.dosesByVaccine).toEqual([{ vaccineCode: '03', vaccineName: 'MMR', count: 2 }]);
    expect(analytics.dosesOverTime).toEqual([{ period: '2025-06', count: 3 }]);
  });

  it('computes coverage and series completion from patient records', async () => {
    (ImmunizationModel.countDocuments as jest.Mock).mockResolvedValue(2);
    (ImmunizationModel.aggregate as jest.Mock).mockResolvedValue([]);
    (ImmunizationModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            patientId: PATIENT_ID,
            vaccineCode: '03',
            doseNumber: 1,
            administeredDate: new Date('2025-02-01'),
          },
          {
            patientId: PATIENT_ID,
            vaccineCode: '03',
            doseNumber: 2,
            administeredDate: new Date('2025-06-01'),
          },
        ]),
      }),
    });
    // 5-year-old patient with both MMR doses — MMR series complete, but other
    // childhood vaccines are not started, so overall completion is incomplete.
    mockPatientLookup([{ _id: PATIENT_ID, dateOfBirth: '2020-01-15' }]);
    mockFindWithLean(VaccineAdverseEventModel, []);
    mockFindWithLean(VaccineLotModel, []);

    const analytics = await getImmunizationAnalytics(CLINIC_ID, FROM, TO);

    expect(analytics.seriesCompletion.completed).toBe(0);
    expect(analytics.seriesCompletion.incomplete).toBe(1);
    const mmrCoverage = analytics.vaccineCoverage.find((c) => c.vaccineCode === '03');
    expect(mmrCoverage).toBeDefined();
    expect(mmrCoverage!.eligible).toBe(1);
    expect(mmrCoverage!.protected).toBe(1);
    expect(mmrCoverage!.coveragePercent).toBe(100);
  });

  it('counts adverse events by severity and summarizes lot inventory', async () => {
    (ImmunizationModel.countDocuments as jest.Mock).mockResolvedValue(0);
    (ImmunizationModel.aggregate as jest.Mock).mockResolvedValue([]);
    (ImmunizationModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
    mockPatientLookup([]);
    mockFindWithLean(VaccineAdverseEventModel, [{ severity: 'severe' }, { severity: 'moderate' }]);
    mockFindWithLean(VaccineLotModel, [
      { status: 'active', quantityReceived: 100, quantityAdministered: 20, quantityWasted: 0 },
      { status: 'low', quantityReceived: 50, quantityAdministered: 45, quantityWasted: 0 },
      { status: 'recalled', quantityReceived: 10, quantityAdministered: 0, quantityWasted: 0 },
    ]);

    const analytics = await getImmunizationAnalytics(CLINIC_ID, FROM, TO);

    expect(analytics.adverseEvents.total).toBe(2);
    expect(analytics.adverseEvents.bySeverity).toEqual({ severe: 1, moderate: 1 });
    expect(analytics.lotInventory.totalLots).toBe(3);
    expect(analytics.lotInventory.activeLots).toBe(1);
    expect(analytics.lotInventory.lowStockLots).toBe(1);
    expect(analytics.lotInventory.recalledLots).toBe(1);
    expect(analytics.lotInventory.dosesOnHand).toBe(85);
  });
});
