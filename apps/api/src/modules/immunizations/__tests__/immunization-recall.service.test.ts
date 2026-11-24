import {
  createRecall,
  listRecalls,
  getAffectedPatients,
  resolveRecall,
  findAffectedPatients,
  markPatientsNotified,
} from '../immunization-recall.service';

jest.mock('../vaccine-lot.model', () => ({
  VaccineLotModel: { findOne: jest.fn() },
}));

jest.mock('../vaccine-lot.service', () => ({
  recallLot: jest.fn(),
}));

jest.mock('../immunization.model', () => ({
  ImmunizationModel: { find: jest.fn() },
}));

jest.mock('../immunization-recall.model', () => ({
  ImmunizationRecallModel: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('../../patients/models/patient.model', () => ({
  PatientModel: { find: jest.fn() },
}));

import { VaccineLotModel } from '../vaccine-lot.model';
import { recallLot } from '../vaccine-lot.service';
import { ImmunizationModel } from '../immunization.model';
import { ImmunizationRecallModel } from '../immunization-recall.model';
import { PatientModel } from '../../patients/models/patient.model';

const CLINIC_ID = '507f1f77bcf86cd799439011';
const LOT_ID = '507f1f77bcf86cd799439012';
const RECALL_ID = '507f1f77bcf86cd799439013';
const PATIENT_A = '507f1f77bcf86cd799439014';
const PATIENT_B = '507f1f77bcf86cd799439015';
const USER_ID = '507f1f77bcf86cd799439016';

const lot = {
  _id: LOT_ID,
  clinicId: CLINIC_ID,
  lotNumber: 'LOT-1',
  vaccineCode: '03',
  vaccineName: 'MMR',
  manufacturer: 'Merck',
  status: 'active',
};

describe('createRecall', () => {
  beforeEach(() => jest.clearAllMocks());

  it('recalls the lot, counts affected patients, and records the recall', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockResolvedValue(lot);
    (ImmunizationModel.find as jest.Mock).mockReturnValue({
      distinct: jest.fn().mockResolvedValue([PATIENT_A, PATIENT_B]),
    });
    (recallLot as jest.Mock).mockResolvedValue({ ...lot, status: 'recalled' });
    (ImmunizationRecallModel.create as jest.Mock).mockImplementation(
      (doc: Record<string, unknown>) => Promise.resolve(doc)
    );

    const recall = await createRecall({
      clinicId: CLINIC_ID,
      lotId: LOT_ID,
      reason: 'Contamination risk',
      severity: 'high',
      initiatedBy: USER_ID,
    });

    expect(recallLot).toHaveBeenCalledWith(LOT_ID, CLINIC_ID, 'Contamination risk');
    expect(recall.affectedPatientCount).toBe(2);
    expect(recall.lotNumber).toBe('LOT-1');
    expect(recall.severity).toBe('high');
    expect(recall.initiatedBy).toBe(USER_ID);
  });

  it('throws 404 when the lot is not found', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      createRecall({
        clinicId: CLINIC_ID,
        lotId: LOT_ID,
        reason: 'test',
        severity: 'low',
        initiatedBy: USER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when the lot is already recalled', async () => {
    (VaccineLotModel.findOne as jest.Mock).mockResolvedValue({ ...lot, status: 'recalled' });

    await expect(
      createRecall({
        clinicId: CLINIC_ID,
        lotId: LOT_ID,
        reason: 'test',
        severity: 'low',
        initiatedBy: USER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('findAffectedPatients', () => {
  it('returns distinct patient ids for a lot', async () => {
    (ImmunizationModel.find as jest.Mock).mockReturnValue({
      distinct: jest.fn().mockResolvedValue([PATIENT_A, PATIENT_B]),
    });

    const ids = await findAffectedPatients(CLINIC_ID, 'LOT-1');
    expect(ids).toEqual([PATIENT_A, PATIENT_B]);
    expect(ImmunizationModel.find).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      lotNumber: 'LOT-1',
      isActive: true,
    });
  });
});

describe('getAffectedPatients', () => {
  it('returns recall with patient demographics', async () => {
    (ImmunizationRecallModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: RECALL_ID, lotNumber: 'LOT-1' }),
    });
    (ImmunizationModel.find as jest.Mock).mockReturnValue({
      distinct: jest.fn().mockResolvedValue([PATIENT_A]),
    });
    (PatientModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([
            {
              _id: PATIENT_A,
              firstName: 'Jane',
              lastName: 'Doe',
              systemId: 'P-1',
              dateOfBirth: '2020-01-01',
            },
          ]),
      }),
    });

    const result = await getAffectedPatients(RECALL_ID, CLINIC_ID);
    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].firstName).toBe('Jane');
  });
});

describe('resolveRecall / markPatientsNotified / listRecalls', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves a recall', async () => {
    (ImmunizationRecallModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
      _id: RECALL_ID,
      status: 'resolved',
    });

    const recall = await resolveRecall(RECALL_ID, CLINIC_ID, USER_ID);
    expect(recall.status).toBe('resolved');
    expect(ImmunizationRecallModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: RECALL_ID, clinicId: CLINIC_ID },
      expect.objectContaining({ status: 'resolved', resolvedBy: USER_ID }),
      { new: true }
    );
  });

  it('marks patients as notified', async () => {
    (ImmunizationRecallModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
      _id: RECALL_ID,
      patientsNotified: true,
    });

    const recall = await markPatientsNotified(RECALL_ID, CLINIC_ID);
    expect(recall.patientsNotified).toBe(true);
  });

  it('lists recalls scoped to clinic', async () => {
    (ImmunizationRecallModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ _id: RECALL_ID }]),
        }),
      }),
    });

    const recalls = await listRecalls(CLINIC_ID, { status: 'active' });
    expect(recalls).toHaveLength(1);
    expect(ImmunizationRecallModel.find).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      status: 'active',
    });
  });
});
