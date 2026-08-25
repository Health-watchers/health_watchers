import { calculateClinicMetrics, getBenchmarkComparison } from '../benchmarking.service';
import { PatientModel } from '../../patients/models/patient.model';
import { EncounterModel } from '../../encounters/encounter.model';
import { PaymentRecordModel } from '../../payments/models/payment-record.model';
import { ClinicModel } from '../../clinics/clinic.model';

jest.mock('../../patients/models/patient.model', () => ({
  PatientModel: { countDocuments: jest.fn() },
}));
jest.mock('../../encounters/encounter.model', () => ({
  EncounterModel: { find: jest.fn(), countDocuments: jest.fn() },
}));
jest.mock('../../payments/models/payment-record.model', () => ({
  PaymentRecordModel: { find: jest.fn() },
}));
jest.mock('../../clinics/clinic.model', () => ({
  ClinicModel: { find: jest.fn() },
}));

function leanArray(data: unknown[]) {
  return { lean: jest.fn().mockResolvedValue(data) };
}

describe('calculateClinicMetrics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all-zero metrics for a clinic with no patients or encounters', async () => {
    (PatientModel.countDocuments as jest.Mock).mockResolvedValue(0);
    (EncounterModel.find as jest.Mock).mockReturnValue(leanArray([]));
    (PaymentRecordModel.find as jest.Mock).mockReturnValue(leanArray([]));
    (EncounterModel.countDocuments as jest.Mock).mockResolvedValue(0);

    const metrics = await calculateClinicMetrics('c1');

    expect(metrics.totalPatients).toBe(0);
    expect(metrics.totalEncounters).toBe(0);
    expect(metrics.encountersPerPatientPerYear).toBe(0);
    expect(metrics.paymentSuccessRate).toBe(0);
    expect(metrics.patientRetentionRate).toBe(0);
  });

  it('computes payment success rate from confirmed vs. total payments', async () => {
    (PatientModel.countDocuments as jest.Mock).mockResolvedValue(2);
    (EncounterModel.find as jest.Mock).mockReturnValue(leanArray([]));
    (PaymentRecordModel.find as jest.Mock).mockReturnValue(
      leanArray([{ status: 'confirmed' }, { status: 'confirmed' }, { status: 'failed' }, { status: 'failed' }])
    );
    (EncounterModel.countDocuments as jest.Mock).mockResolvedValue(0);

    const metrics = await calculateClinicMetrics('c1');

    expect(metrics.paymentSuccessRate).toBe(50);
  });

  it('computes patient retention rate for patients with 2+ encounters', async () => {
    (PatientModel.countDocuments as jest.Mock).mockResolvedValue(2);
    (EncounterModel.find as jest.Mock).mockReturnValue(
      leanArray([
        { patientId: 'p1', createdAt: new Date() },
        { patientId: 'p1', createdAt: new Date() },
        { patientId: 'p2', createdAt: new Date() },
      ])
    );
    (PaymentRecordModel.find as jest.Mock).mockReturnValue(leanArray([]));
    (EncounterModel.countDocuments as jest.Mock).mockResolvedValue(0);

    const metrics = await calculateClinicMetrics('c1');

    expect(metrics.totalEncounters).toBe(3);
    expect(metrics.patientRetentionRate).toBe(50);
  });
});

describe('getBenchmarkComparison', () => {
  beforeEach(() => jest.clearAllMocks());

  it('categorizes a small clinic and returns zeroed percentiles when no peers exist', async () => {
    (PatientModel.countDocuments as jest.Mock).mockResolvedValue(10);
    (EncounterModel.find as jest.Mock).mockReturnValue(leanArray([]));
    (PaymentRecordModel.find as jest.Mock).mockReturnValue(leanArray([]));
    (EncounterModel.countDocuments as jest.Mock).mockResolvedValue(0);
    (ClinicModel.find as jest.Mock).mockReturnValue(leanArray([]));

    const result = await getBenchmarkComparison('c1');

    expect(result.category).toBe('small');
    expect(result.comparisons).toHaveLength(6);
    expect(result.comparisons[0].percentiles).toEqual({ p25: 0, p50: 0, p75: 0, p90: 0 });
    expect(result.comparisons[0].percentileRank).toBe(25);
  });
});
