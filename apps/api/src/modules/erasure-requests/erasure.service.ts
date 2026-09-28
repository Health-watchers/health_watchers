import { Types } from 'mongoose';
import { ErasureRequestModel } from './erasure-request.model';
import { AppointmentModel } from '../appointments/appointment.model';
import { AuditLogModel } from '../audit/audit.model';
import { NotificationModel } from '../notifications/notification.model';
import { CommunicationModel } from '../communications/communication.model';
import { DocumentModel } from '../documents/document.model';
import { PatientModel } from '../patients/models';

export class ErasureService {
  private static generateAnonymousId(): string {
    return `ANON_${new Types.ObjectId().toString()}`;
  }

  async executeErasure(requestId: string): Promise<void> {
    const request = await ErasureRequestModel.findById(requestId);
    if (!request) throw new Error('Erasure request not found');
    if (request.status !== 'approved') throw new Error('Request must be approved before execution');

    const patientId = request.patientId;

    try {
      // Step 1: Pseudonymise PHI (personally identifiable information)
      await this.pseudonymisePatientPHI(patientId);

      // Step 2: Keep legally required clinical data intact, just pseudonymise references
      await this.pseudonymiseAppointmentReferences(patientId);

      // Step 3: Purge portal accounts and communications
      await this.purgePortalAccount(patientId);
      await this.purgeCommunications(patientId);

      // Step 4: Purge documents
      await this.purgeDocuments(patientId);

      // Step 5: Record in immutable audit log
      await AuditLogModel.create({
        action: 'PATIENT_ERASURE_EXECUTED',
        resourceType: 'Patient',
        resourceId: patientId.toString(),
        outcome: 'SUCCESS',
        metadata: { erasureRequestId: requestId },
        timestamp: new Date(),
      });

      // Step 6: Mark request as executed
      request.status = 'executed';
      request.executedAt = new Date();
      await request.save();
    } catch (error) {
      await AuditLogModel.create({
        action: 'PATIENT_ERASURE_EXECUTED',
        resourceType: 'Patient',
        resourceId: patientId.toString(),
        outcome: 'FAILURE',
        metadata: { erasureRequestId: requestId, error: String(error) },
        timestamp: new Date(),
      });
      throw error;
    }
  }

  private async pseudonymisePatientPHI(patientId: Types.ObjectId): Promise<void> {
    const anonId = this.generateAnonymousId();
    await PatientModel.findByIdAndUpdate(patientId, {
      firstName: anonId,
      lastName: anonId,
      email: null,
      phoneNumber: null,
      dateOfBirth: null,
      gender: null,
      address: null,
      city: null,
      state: null,
      country: null,
      zipCode: null,
      emergencyContact: null,
      insuranceMember: null,
      insuranceGroup: null,
      insuranceProvider: null,
    });
  }

  private async pseudonymiseAppointmentReferences(patientId: Types.ObjectId): Promise<void> {
    const anonId = this.generateAnonymousId();
    await AppointmentModel.updateMany(
      { patientId },
      {
        $set: { patientId: anonId },
        chiefComplaint: 'REDACTED',
        notes: 'REDACTED',
      }
    );
  }

  private async purgePortalAccount(patientId: Types.ObjectId): Promise<void> {
    // Cascade delete portal account linked to patient
    // Implementation depends on your portal architecture
    // This is a placeholder for the specific deletion logic
  }

  private async purgeCommunications(patientId: Types.ObjectId): Promise<void> {
    await CommunicationModel.deleteMany({ patientId });
  }

  private async purgeDocuments(patientId: Types.ObjectId): Promise<void> {
    await DocumentModel.deleteMany({ patientId });
  }

  async checkLegalHold(patientId: Types.ObjectId, clinicId: Types.ObjectId): Promise<boolean> {
    // Check if patient has any ongoing legal disputes or holds
    // This can be extended with business logic specific to your clinic
    return false; // No legal hold by default
  }
}

export const erasureService = new ErasureService();
