import { PatientModel } from './models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { Types } from 'mongoose';
import { AuditService } from '@api/modules/audit/audit.service';

export class PatientMergeService {
  /**
   * Merge duplicate patient records
   * Moves all related records from duplicate to primary
   */
  static async mergePatients(
    primaryId: string,
    duplicateId: string,
    userId: string,
    clinicId: string
  ): Promise<any> {
    // Validate both patients exist and belong to same clinic
    const primary = await PatientModel.findById(primaryId);
    const duplicate = await PatientModel.findById(duplicateId);
    
    if (!primary || !duplicate) {
      throw new Error('One or both patients not found');
    }
    
    if (primary.clinicId.toString() !== duplicate.clinicId.toString()) {
      throw new Error('Patients must belong to the same clinic');
    }
    
    if (primary.clinicId.toString() !== clinicId) {
      throw new Error('Patients do not belong to your clinic');
    }
    
    if (duplicate.isDuplicate) {
      throw new Error('Duplicate patient has already been merged');
    }
    
    // Start transaction-like operations
    const session = await PatientModel.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Move all encounters
        await EncounterModel.updateMany(
          { patientId: new Types.ObjectId(duplicateId) },
          { $set: { patientId: new Types.ObjectId(primaryId) } }
        );
        
        // Merge allergies (avoid duplicates)
        const duplicateAllergies = duplicate.allergies || [];
        for (const allergy of duplicateAllergies) {
          const exists = primary.allergies?.some(
            a => a.allergen === allergy.allergen && a.allergenType === allergy.allergenType
          );
          if (!exists) {
            primary.allergies = primary.allergies || [];
            primary.allergies.push(allergy);
          }
        }
        
        // Mark duplicate as merged
        duplicate.isDuplicate = true;
        duplicate.mergedInto = new Types.ObjectId(primaryId);
        duplicate.isActive = false;
        
        await primary.save();
        await duplicate.save();
        
        // Audit log
        await AuditService.log({
          userId,
          clinicId: new Types.ObjectId(clinicId),
          action: 'patient_merge',
          resource: 'patient',
          resourceId: primaryId,
          details: {
            primaryPatientId: primaryId,
            duplicatePatientId: duplicateId,
            primaryName: `${primary.firstName} ${primary.lastName}`,
            duplicateName: `${duplicate.firstName} ${duplicate.lastName}`,
          },
          ipAddress: 'system',
          userAgent: 'merge-service',
        });
      });
      
      return {
        primary,
        duplicate,
        message: 'Patients merged successfully',
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get merged patient (redirect to primary)
   */
  static async getMergedPatient(patientId: string): Promise<any> {
    const patient = await PatientModel.findById(patientId);
    
    if (!patient) {
      throw new Error('Patient not found');
    }
    
    if (patient.isDuplicate && patient.mergedInto) {
      // Redirect to primary record
      return PatientModel.findById(patient.mergedInto);
    }
    
    return patient;
  }
}
