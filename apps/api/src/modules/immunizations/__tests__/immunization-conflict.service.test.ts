import {
  detectScheduleConflicts,
  detectLotConflicts,
  detectVaccineConflicts,
  ageInMonthsAt,
} from '../immunization-conflict.service';

jest.mock('../vaccine-lot.model', () => ({
  VaccineLotModel: { findOne: jest.fn() },
}));

import { VaccineLotModel } from '../vaccine-lot.model';

const DOB = '2020-01-15'; // patient born 2020-01-15

function previousDose(doseNumber: number, administeredDate: string) {
  return { vaccineCode: '03', doseNumber, administeredDate: new Date(administeredDate) };
}

describe('ageInMonthsAt', () => {
  it('computes age in months at a given date', () => {
    expect(ageInMonthsAt('2020-01-15', new Date('2020-04-15'))).toBe(3);
    expect(ageInMonthsAt('2020-01-15', new Date('2021-01-15'))).toBe(12);
  });
});

describe('detectScheduleConflicts', () => {
  it('flags a dose given below the minimum age as critical', () => {
    const conflicts = detectScheduleConflicts({
      dateOfBirth: '2020-01-15',
      vaccineCode: '20', // DTaP
      doseNumber: 2, // min age 4 months
      administeredDate: new Date('2020-04-15'), // 3 months old
      previousDoses: [previousDose(1, '2020-03-15')],
    });

    const conflict = conflicts.find((c) => c.type === 'too_early_age');
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe('critical');
  });

  it('flags a dose past the maximum age', () => {
    const conflicts = detectScheduleConflicts({
      dateOfBirth: '2019-01-15',
      vaccineCode: '122', // Rotavirus, dose 1 max age 4 months
      doseNumber: 1,
      administeredDate: new Date('2019-12-15'), // 11 months old
      previousDoses: [],
    });

    const conflict = conflicts.find((c) => c.type === 'past_max_age');
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe('warning');
  });

  it('flags an insufficient interval between doses', () => {
    const conflicts = detectScheduleConflicts({
      dateOfBirth: '2018-01-15',
      vaccineCode: '03', // MMR dose 2, min interval 28 days
      doseNumber: 2,
      administeredDate: new Date('2022-06-01'),
      previousDoses: [previousDose(1, '2022-05-20')], // 12 days earlier
    });

    const conflict = conflicts.find((c) => c.type === 'insufficient_interval');
    expect(conflict).toBeDefined();
    expect(conflict!.message).toContain('28 days');
  });

  it('flags a duplicate dose as critical', () => {
    const conflicts = detectScheduleConflicts({
      dateOfBirth: DOB,
      vaccineCode: '03',
      doseNumber: 1,
      administeredDate: new Date('2021-06-01'),
      previousDoses: [previousDose(1, '2021-05-01')],
    });

    const conflict = conflicts.find((c) => c.type === 'duplicate_dose');
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe('critical');
  });

  it('flags a dose beyond the series total', () => {
    const conflicts = detectScheduleConflicts({
      dateOfBirth: DOB,
      vaccineCode: '03',
      doseNumber: 3, // MMR series total is 2
      administeredDate: new Date('2022-06-01'),
      previousDoses: [previousDose(1, '2021-05-01'), previousDose(2, '2021-06-01')],
    });

    const conflict = conflicts.find((c) => c.type === 'series_complete');
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe('info');
  });

  it('returns no conflicts for a valid dose', () => {
    const conflicts = detectScheduleConflicts({
      dateOfBirth: DOB,
      vaccineCode: '03',
      doseNumber: 1, // min age 12 months
      administeredDate: new Date('2021-05-01'), // 15 months
      previousDoses: [],
    });
    expect(conflicts).toHaveLength(0);
  });
});

describe('detectLotConflicts', () => {
  beforeEach(() => jest.clearAllMocks());

  const baseLot = {
    _id: 'lot1',
    clinicId: 'clinic-1',
    lotNumber: 'LOT-1',
    vaccineCode: '03',
    vaccineName: 'MMR',
    manufacturer: 'Merck',
    expiryDate: new Date('2030-01-01'),
    quantityReceived: 100,
    quantityAdministered: 10,
    quantityWasted: 0,
    status: 'active',
  };

  it('warns when the lot is not tracked in inventory', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const conflicts = await detectLotConflicts('clinic-1', 'UNKNOWN-LOT');
    expect(conflicts[0].type).toBe('unknown_lot');
    expect(conflicts[0].severity).toBe('warning');
  });

  it('flags a recalled lot as critical', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockReturnValue({
      lean: jest
        .fn()
        .mockResolvedValue({ ...baseLot, status: 'recalled', recalledReason: 'Contamination' }),
    });

    const conflicts = await detectLotConflicts('clinic-1', 'LOT-1');
    const conflict = conflicts.find((c) => c.type === 'recalled_lot');
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe('critical');
    expect(conflict!.message).toContain('Contamination');
  });

  it('flags an expired lot as critical', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...baseLot, expiryDate: new Date('2020-01-01') }),
    });

    const conflicts = await detectLotConflicts('clinic-1', 'LOT-1');
    const conflict = conflicts.find((c) => c.type === 'expired_lot');
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe('critical');
  });

  it('warns when the lot is depleted', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        ...baseLot,
        quantityReceived: 100,
        quantityAdministered: 100,
        quantityWasted: 0,
        status: 'depleted',
      }),
    });

    const conflicts = await detectLotConflicts('clinic-1', 'LOT-1');
    const conflict = conflicts.find((c) => c.type === 'depleted_lot');
    expect(conflict).toBeDefined();
  });
});

describe('detectVaccineConflicts', () => {
  it('combines schedule and lot conflicts', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const conflicts = await detectVaccineConflicts({
      clinicId: 'clinic-1',
      dateOfBirth: '2020-01-15',
      vaccineCode: '20',
      doseNumber: 2,
      administeredDate: new Date('2020-04-15'), // too early
      previousDoses: [previousDose(1, '2020-03-15')],
      lotNumber: 'UNKNOWN',
    });

    expect(conflicts.some((c) => c.type === 'too_early_age')).toBe(true);
    expect(conflicts.some((c) => c.type === 'unknown_lot')).toBe(true);
  });
});
