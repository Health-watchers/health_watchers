import { EncounterModel } from './encounter.model';
import { Types } from 'mongoose';

export interface CoSignatureRules {
  ASSISTANT: boolean;
  NURSE: 'always' | 'prescriptions_only' | 'never';
  DOCTOR: boolean;
}

// Default co-signature rules (can be overridden per clinic)
const DEFAULT_RULES: CoSignatureRules = {
  ASSISTANT: true,
  NURSE: 'prescriptions_only',
  DOCTOR: false,
};

export class CoSignatureService {
  /**
   * Check if an encounter requires co-signature based on user role
   */
  static requiresCoSignature(
    userRole: string,
    hasPrescriptions: boolean = false,
    clinicRules?: CoSignatureRules
  ): boolean {
    const rules = clinicRules || DEFAULT_RULES;
    
    switch (userRole) {
      case 'ASSISTANT':
        return rules.ASSISTANT;
      case 'NURSE':
        if (rules.NURSE === 'always') return true;
        if (rules.NURSE === 'prescriptions_only') return hasPrescriptions;
        return false;
      case 'DOCTOR':
        return rules.DOCTOR;
      default:
        return false;
    }
  }

  /**
   * Get pending co-signature queue for a doctor
   */
  static async getPendingCoSignatureQueue(doctorId: string, clinicId: string) {
    return EncounterModel.find({
      clinicId: new Types.ObjectId(clinicId),
      requiresCoSignature: true,
      coSignatureStatus: 'pending',
      status: 'pending_cosignature',
    })
      .populate('patientId', 'firstName lastName systemId')
      .populate('attendingDoctorId', 'firstName lastName email')
      .sort({ createdAt: 1 }) // Oldest first
      .lean();
  }

  /**
   * Approve co-signature
   */
  static async approveCoSignature(
    encounterId: string,
    doctorId: string,
    notes?: string
  ) {
    const encounter = await EncounterModel.findById(encounterId);
    
    if (!encounter) {
      throw new Error('Encounter not found');
    }
    
    if (!encounter.requiresCoSignature) {
      throw new Error('This encounter does not require co-signature');
    }
    
    if (encounter.coSignatureStatus !== 'pending') {
      throw new Error('This encounter has already been co-signed');
    }
    
    encounter.coSignedBy = new Types.ObjectId(doctorId);
    encounter.coSignedAt = new Date();
    encounter.coSignatureNotes = notes;
    encounter.coSignatureStatus = 'approved';
    encounter.status = 'closed';
    
    await encounter.save();
    return encounter;
  }

  /**
   * Reject co-signature and return to creator
   */
  static async rejectCoSignature(
    encounterId: string,
    doctorId: string,
    notes: string
  ) {
    const encounter = await EncounterModel.findById(encounterId);
    
    if (!encounter) {
      throw new Error('Encounter not found');
    }
    
    if (!encounter.requiresCoSignature) {
      throw new Error('This encounter does not require co-signature');
    }
    
    if (encounter.coSignatureStatus !== 'pending') {
      throw new Error('This encounter has already been co-signed');
    }
    
    if (!notes) {
      throw new Error('Rejection notes are required');
    }
    
    encounter.coSignedBy = new Types.ObjectId(doctorId);
    encounter.coSignedAt = new Date();
    encounter.coSignatureNotes = notes;
    encounter.coSignatureStatus = 'rejected';
    encounter.status = 'open'; // Return to open for revision
    
    await encounter.save();
    return encounter;
  }

  /**
   * Check if encounter can be closed (co-signature requirement met)
   */
  static canClose(encounter: any): boolean {
    if (!encounter.requiresCoSignature) {
      return true;
    }
    
    return encounter.coSignatureStatus === 'approved';
  }
}
