import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CoSignatureService } from '../cosignature.service';
import { EncounterModel } from '../encounter.model';
import * as socket from '@api/realtime/socket';
import * as notificationService from '@api/modules/notifications/notification.service';

let mongod: MongoMemoryServer;

const clinicId = new Types.ObjectId();
const requestingDoctorId = new Types.ObjectId();
const targetDoctorId = new Types.ObjectId();

function makeEncounter(overrides = {}) {
  return {
    patientId: new Types.ObjectId(),
    clinicId,
    attendingDoctorId: requestingDoctorId,
    chiefComplaint: 'Test complaint',
    status: 'open',
    requiresCoSignature: true,
    coSignatureStatus: 'pending',
    coSignatureRequestedBy: requestingDoctorId,
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
  await EncounterModel.deleteMany({});
  jest.restoreAllMocks();
});

describe('CoSignatureService — Socket.IO emissions', () => {
  let emitSpy: jest.SpyInstance;
  let notifySpy: jest.SpyInstance;

  beforeEach(() => {
    emitSpy = jest.spyOn(socket, 'emitToUser').mockReturnValue();
    notifySpy = jest.spyOn(notificationService, 'createNotification').mockResolvedValue(null as any);
  });

  it('emits cosignature:requested to target doctor when co-sign is requested', async () => {
    const encounter = await EncounterModel.create({
      patientId: new Types.ObjectId(),
      clinicId,
      attendingDoctorId: requestingDoctorId,
      chiefComplaint: 'Headache',
      status: 'open',
    });

    await CoSignatureService.requestCoSignature(
      String(encounter._id),
      String(requestingDoctorId),
      String(targetDoctorId),
      String(clinicId)
    );

    expect(emitSpy).toHaveBeenCalledWith(
      String(targetDoctorId),
      'cosignature:requested',
      expect.objectContaining({ encounterId: String(encounter._id) })
    );
  });

  it('persists a cosignature_requested notification for the target doctor', async () => {
    const encounter = await EncounterModel.create({
      patientId: new Types.ObjectId(), clinicId, attendingDoctorId: requestingDoctorId,
      chiefComplaint: 'Test', status: 'open',
    });

    await CoSignatureService.requestCoSignature(
      String(encounter._id), String(requestingDoctorId), String(targetDoctorId), String(clinicId)
    );

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: String(targetDoctorId), type: 'cosignature_requested' })
    );
  });

  it('emits cosignature:completed to requesting doctor on approval', async () => {
    const encounter = await EncounterModel.create(makeEncounter());

    await CoSignatureService.approveCoSignature(String(encounter._id), String(targetDoctorId));

    expect(emitSpy).toHaveBeenCalledWith(
      String(requestingDoctorId),
      'cosignature:completed',
      expect.objectContaining({ encounterId: String(encounter._id) })
    );
  });

  it('persists a cosignature_completed notification for requesting doctor', async () => {
    const encounter = await EncounterModel.create(makeEncounter());

    await CoSignatureService.approveCoSignature(String(encounter._id), String(targetDoctorId));

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: String(requestingDoctorId), type: 'cosignature_completed' })
    );
  });

  it('emits cosignature:rejected to requesting doctor on rejection', async () => {
    const encounter = await EncounterModel.create(makeEncounter());

    await CoSignatureService.rejectCoSignature(
      String(encounter._id), String(targetDoctorId), 'Incomplete notes'
    );

    expect(emitSpy).toHaveBeenCalledWith(
      String(requestingDoctorId),
      'cosignature:rejected',
      expect.objectContaining({ encounterId: String(encounter._id), notes: 'Incomplete notes' })
    );
  });

  it('persists a cosignature_rejected notification for requesting doctor', async () => {
    const encounter = await EncounterModel.create(makeEncounter());

    await CoSignatureService.rejectCoSignature(
      String(encounter._id), String(targetDoctorId), 'Incomplete notes'
    );

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: String(requestingDoctorId), type: 'cosignature_rejected' })
    );
  });
});

describe('CoSignatureService.getPendingCoSignatureQueue', () => {
  it('returns encounters with pending_cosignature status for the clinic', async () => {
    await EncounterModel.create(makeEncounter({ status: 'pending_cosignature' }));
    await EncounterModel.create(makeEncounter({ status: 'closed', coSignatureStatus: 'approved' }));

    const queue = await CoSignatureService.getPendingCoSignatureQueue(
      String(requestingDoctorId), String(clinicId)
    );

    expect(queue).toHaveLength(1);
    expect((queue[0] as any).status).toBe('pending_cosignature');
  });
});
