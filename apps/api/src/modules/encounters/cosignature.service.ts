import { EncounterModel } from './encounter.model';
import { Types } from 'mongoose';
import { emitToUser } from '@api/realtime/socket';
import { createNotification } from '@api/modules/notifications/notification.service';

export interface CoSignatureRules {
  ASSISTANT: boolean;
  NURSE: 'always' | 'prescriptions_only' | 'never';
  DOCTOR: boolean;
}

const DEFAULT_RULES: CoSignatureRules = {
  ASSISTANT: true,
  NURSE: 'prescriptions_only',
  DOCTOR: false,
};

export class CoSignatureService {
  static requiresCoSignature(
    userRole: string,
    hasPrescriptions = false,
    clinicRules?: CoSignatureRules
  ): boolean {
    const rules = clinicRules ?? DEFAULT_RULES;
    switch (userRole) {
      case 'ASSISTANT': return rules.ASSISTANT;
      case 'NURSE':
        if (rules.NURSE === 'always') return true;
        if (rules.NURSE === 'prescriptions_only') return hasPrescriptions;
        return false;
      case 'DOCTOR': return rules.DOCTOR;
      default: return false;
    }
  }

  /** GET /encounters/pending-cosignatures — list for the requesting doctor */
  static async getPendingCoSignatureQueue(doctorId: string, clinicId: string) {
    return EncounterModel.find({
      clinicId: new Types.ObjectId(clinicId),
      requiresCoSignature: true,
      coSignatureStatus: 'pending',
      status: 'pending_cosignature',
    })
      .populate('patientId', 'firstName lastName systemId')
      .populate('attendingDoctorId', 'firstName lastName email')
      .sort({ createdAt: 1 })
      .lean();
  }

  /**
   * Request a co-signature.
   * Emits cosignature:requested to the target doctor and persists a notification.
   */
  static async requestCoSignature(
    encounterId: string,
    requestingUserId: string,
    targetDoctorId: string,
    clinicId: string
  ) {
    const encounter = await EncounterModel.findById(encounterId);
    if (!encounter) throw new Error('Encounter not found');

    encounter.status = 'pending_cosignature';
    (encounter as any).requiresCoSignature = true;
    (encounter as any).coSignatureStatus = 'pending';
    (encounter as any).coSignatureRequestedBy = new Types.ObjectId(requestingUserId);
    (encounter as any).coSignatureRequestedAt = new Date();
    await encounter.save();

    const payload = { encounterId, requestedBy: requestingUserId };

    emitToUser(targetDoctorId, 'cosignature:requested', payload);

    createNotification({
      userId: targetDoctorId,
      clinicId,
      type: 'cosignature_requested',
      title: 'Co-signature Requested',
      message: 'An encounter requires your co-signature.',
      link: `/encounters?cosign=${encounterId}`,
      metadata: payload,
    }).catch(() => {/* non-fatal */});

    return encounter;
  }

  /** Approve co-signature — notifies the requesting doctor */
  static async approveCoSignature(encounterId: string, doctorId: string, notes?: string) {
    const encounter = await EncounterModel.findById(encounterId);
    if (!encounter) throw new Error('Encounter not found');
    if (!(encounter as any).requiresCoSignature) throw new Error('This encounter does not require co-signature');
    if ((encounter as any).coSignatureStatus !== 'pending') throw new Error('This encounter has already been co-signed');

    encounter.coSignedBy = new Types.ObjectId(doctorId);
    encounter.coSignedAt = new Date();
    encounter.coSignatureNotes = notes;
    (encounter as any).coSignatureStatus = 'approved';
    encounter.status = 'closed';
    await encounter.save();

    const requestingDoctorId = String((encounter as any).coSignatureRequestedBy ?? encounter.attendingDoctorId);
    const clinicId = String(encounter.clinicId);
    const payload = { encounterId, coSignedBy: doctorId };

    emitToUser(requestingDoctorId, 'cosignature:completed', payload);

    createNotification({
      userId: requestingDoctorId,
      clinicId,
      type: 'cosignature_completed',
      title: 'Co-signature Completed',
      message: 'Your encounter has been co-signed.',
      link: `/encounters`,
      metadata: payload,
    }).catch(() => {/* non-fatal */});

    return encounter;
  }

  /** Reject co-signature — notifies the requesting doctor */
  static async rejectCoSignature(encounterId: string, doctorId: string, notes: string) {
    const encounter = await EncounterModel.findById(encounterId);
    if (!encounter) throw new Error('Encounter not found');
    if (!(encounter as any).requiresCoSignature) throw new Error('This encounter does not require co-signature');
    if ((encounter as any).coSignatureStatus !== 'pending') throw new Error('This encounter has already been co-signed');
    if (!notes) throw new Error('Rejection notes are required');

    encounter.coSignedBy = new Types.ObjectId(doctorId);
    encounter.coSignedAt = new Date();
    encounter.coSignatureNotes = notes;
    (encounter as any).coSignatureStatus = 'rejected';
    encounter.status = 'open';
    await encounter.save();

    const requestingDoctorId = String((encounter as any).coSignatureRequestedBy ?? encounter.attendingDoctorId);
    const clinicId = String(encounter.clinicId);
    const payload = { encounterId, rejectedBy: doctorId, notes };

    emitToUser(requestingDoctorId, 'cosignature:rejected', payload);

    createNotification({
      userId: requestingDoctorId,
      clinicId,
      type: 'cosignature_rejected',
      title: 'Co-signature Rejected',
      message: `Your encounter was returned for revision: ${notes}`,
      link: `/encounters`,
      metadata: payload,
    }).catch(() => {/* non-fatal */});

    return encounter;
  }

  static canClose(encounter: any): boolean {
    if (!encounter.requiresCoSignature) return true;
    return encounter.coSignatureStatus === 'approved';
  }
}
