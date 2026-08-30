import {
  reportAdverseEvent,
  listAdverseEvents,
  getAdverseEvent,
  updateAdverseEvent,
} from '../adverse-event.service';

jest.mock('../adverse-event.model', () => ({
  VaccineAdverseEventModel: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

import { VaccineAdverseEventModel } from '../adverse-event.model';

const CLINIC_ID = '507f1f77bcf86cd799439011';
const PATIENT_ID = '507f1f77bcf86cd799439012';
const EVENT_ID = '507f1f77bcf86cd799439013';
const USER_ID = '507f1f77bcf86cd799439014';

const baseInput = {
  clinicId: CLINIC_ID,
  patientId: PATIENT_ID,
  vaccineCode: '03',
  vaccineName: 'MMR',
  description: 'Fever and rash',
  severity: 'moderate' as const,
  onsetDate: new Date('2026-01-02T00:00:00.000Z'),
  outcome: 'recovering' as const,
  reportedToVAERS: false,
  reportedBy: USER_ID,
};

describe('reportAdverseEvent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates an adverse event record', async () => {
    (VaccineAdverseEventModel.create as jest.Mock).mockResolvedValue({ _id: EVENT_ID });

    await reportAdverseEvent(baseInput);

    expect(VaccineAdverseEventModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        vaccineCode: '03',
        severity: 'moderate',
        reportedBy: USER_ID,
      })
    );
  });

  it('sets reportedDate when reported to VAERS', async () => {
    (VaccineAdverseEventModel.create as jest.Mock).mockImplementation(
      (doc: Record<string, unknown>) => Promise.resolve(doc)
    );

    const event = await reportAdverseEvent({
      ...baseInput,
      reportedToVAERS: true,
      vaersReportId: 'VAERS-1',
    });

    expect(event.reportedDate).toBeInstanceOf(Date);
    expect(event.vaersReportId).toBe('VAERS-1');
  });

  it('leaves reportedDate undefined when not reported to VAERS', async () => {
    (VaccineAdverseEventModel.create as jest.Mock).mockImplementation(
      (doc: Record<string, unknown>) => Promise.resolve(doc)
    );

    const event = await reportAdverseEvent(baseInput);
    expect(event.reportedDate).toBeUndefined();
  });
});

describe('listAdverseEvents', () => {
  it('scopes to clinic and applies filters', async () => {
    (VaccineAdverseEventModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([{ _id: EVENT_ID }]),
          }),
        }),
      }),
    });

    const events = await listAdverseEvents(CLINIC_ID, { severity: 'severe', limit: 10 });

    expect(events).toHaveLength(1);
    expect(VaccineAdverseEventModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_ID, severity: 'severe' })
    );
  });
});

describe('getAdverseEvent', () => {
  it('throws 404 when not found', async () => {
    (VaccineAdverseEventModel.findOne as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    await expect(getAdverseEvent(EVENT_ID, CLINIC_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateAdverseEvent', () => {
  it('sets reportedDate when marking as reported to VAERS', async () => {
    (VaccineAdverseEventModel.findOneAndUpdate as jest.Mock).mockResolvedValue({ _id: EVENT_ID });

    await updateAdverseEvent(EVENT_ID, CLINIC_ID, { reportedToVAERS: true });

    expect(VaccineAdverseEventModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: EVENT_ID, clinicId: CLINIC_ID },
      expect.objectContaining({
        $set: expect.objectContaining({ reportedToVAERS: true, reportedDate: expect.any(Date) }),
      }),
      { new: true, runValidators: true }
    );
  });

  it('throws 404 when the event is not found', async () => {
    (VaccineAdverseEventModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

    await expect(
      updateAdverseEvent(EVENT_ID, CLINIC_ID, { outcome: 'recovered' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
