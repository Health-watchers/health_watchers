import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PatientMergeService } from '../merge.service';
import { PatientModel } from '../models/patient.model';
import { MergeLogModel } from '../models/merge-log.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { AuditLogModel } from '@api/modules/audit/audit.model';
import * as mailer from '@api/utils/mailer';

let mongod: MongoMemoryServer;

const clinicId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();

function makePatient(overrides = {}) {
  return {
    systemId: new Types.ObjectId().toString(),
    firstName: 'Test',
    lastName: 'Patient',
    searchName: 'test patient',
    dateOfBirth: '1990-01-01',
    sex: 'M',
    clinicId,
    isActive: true,
    allergies: [],
    ...overrides,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([
    PatientModel.deleteMany({}),
    MergeLogModel.deleteMany({}),
    EncounterModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
  ]);
});

describe('PatientMergeService.mergePatients', () => {
  it('merges duplicate into primary and deactivates duplicate', async () => {
    const primary = await PatientModel.create(makePatient({ firstName: 'Primary' }));
    const duplicate = await PatientModel.create(makePatient({ firstName: 'Duplicate' }));

    jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    await PatientMergeService.mergePatients(
      String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
    );

    const updatedDuplicate = await PatientModel.findById(duplicate._id).lean() as any;
    expect(updatedDuplicate.isActive).toBe(false);
    expect(String(updatedDuplicate.mergedInto)).toBe(String(primary._id));
  });

  it('creates a MergeLog with full snapshots of both records', async () => {
    const primary = await PatientModel.create(makePatient({ firstName: 'Primary' }));
    const duplicate = await PatientModel.create(makePatient({ firstName: 'Duplicate' }));

    jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    const { mergeLogId } = await PatientMergeService.mergePatients(
      String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
    );

    const log = await MergeLogModel.findById(mergeLogId).lean();
    expect(log).not.toBeNull();
    expect((log!.primarySnapshot as any).firstName).toBe('Primary');
    expect((log!.duplicateSnapshot as any).firstName).toBe('Duplicate');
  });

  it('writes a PATIENT_MERGE audit log entry', async () => {
    const primary = await PatientModel.create(makePatient());
    const duplicate = await PatientModel.create(makePatient({ firstName: 'Dup' }));

    jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    const { mergeLogId } = await PatientMergeService.mergePatients(
      String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
    );

    // audit log is fire-and-forget — wait a tick
    await new Promise((r) => setTimeout(r, 50));

    const auditEntry = await AuditLogModel.findOne({ action: 'PATIENT_MERGE' }).lean();
    expect(auditEntry).not.toBeNull();
    expect((auditEntry!.metadata as any).mergeLogId).toBe(mergeLogId);
  });

  it('sends an email notification to the admin', async () => {
    const primary = await PatientModel.create(makePatient());
    const duplicate = await PatientModel.create(makePatient({ firstName: 'Dup' }));

    const sendMailSpy = jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    await PatientMergeService.mergePatients(
      String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(sendMailSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@test.com', subject: expect.stringContaining('Merged') })
    );
  });

  it('re-parents encounters from duplicate to primary', async () => {
    const primary = await PatientModel.create(makePatient());
    const duplicate = await PatientModel.create(makePatient({ firstName: 'Dup' }));

    await EncounterModel.create({
      patientId: duplicate._id,
      clinicId,
      attendingDoctorId: new Types.ObjectId(),
      chiefComplaint: 'Headache',
      status: 'open',
    });

    jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    await PatientMergeService.mergePatients(
      String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
    );

    const encounter = await EncounterModel.findOne({ patientId: primary._id }).lean();
    expect(encounter).not.toBeNull();
  });

  it('throws if duplicate is already merged', async () => {
    const primary = await PatientModel.create(makePatient());
    const duplicate = await PatientModel.create(
      makePatient({ firstName: 'Dup', isDuplicate: true, isActive: false })
    );

    jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    await expect(
      PatientMergeService.mergePatients(
        String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
      )
    ).rejects.toThrow('already been merged');
  });
});

describe('PatientMergeService.unmergePatients', () => {
  it('restores both records to their pre-merge state', async () => {
    const primary = await PatientModel.create(makePatient({ firstName: 'Primary' }));
    const duplicate = await PatientModel.create(makePatient({ firstName: 'Duplicate' }));

    jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    const { mergeLogId } = await PatientMergeService.mergePatients(
      String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
    );

    await PatientMergeService.unmergePatients(mergeLogId, userId, clinicId);

    const restoredDuplicate = await PatientModel.findById(duplicate._id).lean() as any;
    expect(restoredDuplicate.isActive).toBe(true);
    expect(restoredDuplicate.isDuplicate).toBeFalsy();
    expect(restoredDuplicate.mergedInto).toBeUndefined();
  });

  it('writes a PATIENT_UNMERGE audit log entry', async () => {
    const primary = await PatientModel.create(makePatient());
    const duplicate = await PatientModel.create(makePatient({ firstName: 'Dup' }));

    jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    const { mergeLogId } = await PatientMergeService.mergePatients(
      String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
    );

    await PatientMergeService.unmergePatients(mergeLogId, userId, clinicId);
    await new Promise((r) => setTimeout(r, 50));

    const auditEntry = await AuditLogModel.findOne({ action: 'PATIENT_UNMERGE' }).lean();
    expect(auditEntry).not.toBeNull();
  });

  it('throws if unmerge is called a second time', async () => {
    const primary = await PatientModel.create(makePatient());
    const duplicate = await PatientModel.create(makePatient({ firstName: 'Dup' }));

    jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    const { mergeLogId } = await PatientMergeService.mergePatients(
      String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
    );

    await PatientMergeService.unmergePatients(mergeLogId, userId, clinicId);

    await expect(
      PatientMergeService.unmergePatients(mergeLogId, userId, clinicId)
    ).rejects.toThrow('already been undone');
  });

  it('throws if merge log belongs to a different clinic', async () => {
    const primary = await PatientModel.create(makePatient());
    const duplicate = await PatientModel.create(makePatient({ firstName: 'Dup' }));

    jest.spyOn(mailer, 'sendMail').mockResolvedValue(undefined);

    const { mergeLogId } = await PatientMergeService.mergePatients(
      String(primary._id), String(duplicate._id), userId, clinicId, 'admin@test.com'
    );

    const otherClinicId = new Types.ObjectId().toString();
    await expect(
      PatientMergeService.unmergePatients(mergeLogId, userId, otherClinicId)
    ).rejects.toThrow('does not belong to your clinic');
  });
});
