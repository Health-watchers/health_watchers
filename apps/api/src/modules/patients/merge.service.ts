import { Types } from 'mongoose';
import { PatientModel } from './models/patient.model';
import { MergeLogModel } from './models/merge-log.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { auditLog } from '@api/modules/audit/audit.service';
import { sendMail } from '@api/utils/mailer';
import logger from '@api/utils/logger';

export class PatientMergeService {
  /**
   * Merge duplicate into primary.
   * Requires confirm:true — snapshot both docs before touching anything.
   */
  static async mergePatients(
    primaryId: string,
    duplicateId: string,
    userId: string,
    clinicId: string,
    adminEmail: string
  ): Promise<{ mergeLogId: string; primaryId: string; duplicateId: string }> {
    const [primary, duplicate] = await Promise.all([
      PatientModel.findById(primaryId).lean(),
      PatientModel.findById(duplicateId).lean(),
    ]);

    if (!primary || !duplicate) throw new Error('One or both patients not found');
    if (primary.clinicId.toString() !== clinicId) throw new Error('Patients do not belong to your clinic');
    if (primary.clinicId.toString() !== duplicate.clinicId.toString()) throw new Error('Patients must belong to the same clinic');
    if ((duplicate as any).isDuplicate) throw new Error('Patient has already been merged');

    // Snapshot before any mutation
    const mergeLog = await MergeLogModel.create({
      primaryId:         new Types.ObjectId(primaryId),
      duplicateId:       new Types.ObjectId(duplicateId),
      clinicId:          new Types.ObjectId(clinicId),
      mergedBy:          new Types.ObjectId(userId),
      primarySnapshot:   primary,
      duplicateSnapshot: duplicate,
    });

    const session = await PatientModel.startSession();
    try {
      await session.withTransaction(async () => {
        // Re-fetch mutable docs inside transaction
        const [primaryDoc, duplicateDoc] = await Promise.all([
          PatientModel.findById(primaryId).session(session),
          PatientModel.findById(duplicateId).session(session),
        ]);
        if (!primaryDoc || !duplicateDoc) throw new Error('Documents disappeared mid-transaction');

        // Re-parent encounters
        await EncounterModel.updateMany(
          { patientId: new Types.ObjectId(duplicateId) },
          { $set: { patientId: new Types.ObjectId(primaryId) } },
          { session }
        );

        // Merge allergies (no duplicates)
        for (const allergy of duplicateDoc.allergies ?? []) {
          const exists = primaryDoc.allergies?.some(
            (a) => a.allergen === allergy.allergen && a.allergenType === allergy.allergenType
          );
          if (!exists) {
            primaryDoc.allergies = primaryDoc.allergies ?? [];
            primaryDoc.allergies.push(allergy);
          }
        }

        // Mark duplicate inactive
        (duplicateDoc as any).isDuplicate = true;
        (duplicateDoc as any).mergedInto = new Types.ObjectId(primaryId);
        duplicateDoc.isActive = false;

        await primaryDoc.save({ session });
        await duplicateDoc.save({ session });
      });
    } finally {
      await session.endSession();
    }

    // Audit log (non-blocking)
    auditLog({
      action: 'PATIENT_MERGE',
      userId,
      clinicId,
      resourceType: 'Patient',
      resourceId: primaryId,
      metadata: {
        mergeLogId: String(mergeLog._id),
        duplicateId,
        primaryName:   `${primary.firstName} ${primary.lastName}`,
        duplicateName: `${duplicate.firstName} ${duplicate.lastName}`,
      },
    }).catch((err) => logger.error({ err }, 'Failed to write PATIENT_MERGE audit log'));

    // Email notification (non-blocking, best-effort)
    sendMail({
      to: adminEmail,
      subject: 'Patient Record Merged — Action Required if Incorrect',
      html: `
        <p>A patient merge was performed in Health Watchers.</p>
        <ul>
          <li><strong>Primary:</strong> ${primary.firstName} ${primary.lastName} (${primaryId})</li>
          <li><strong>Merged (deactivated):</strong> ${duplicate.firstName} ${duplicate.lastName} (${duplicateId})</li>
          <li><strong>Merge log ID:</strong> ${mergeLog._id}</li>
        </ul>
        <p>If this merge was incorrect, use the merge log ID to unmerge via the API.</p>
      `,
    }).catch((err) => logger.warn({ err }, 'Failed to send merge notification email'));

    return { mergeLogId: String(mergeLog._id), primaryId, duplicateId };
  }

  /**
   * Restore both records to their pre-merge state using a MergeLog.
   */
  static async unmergePatients(
    mergeLogId: string,
    userId: string,
    clinicId: string
  ): Promise<void> {
    const log = await MergeLogModel.findById(mergeLogId);
    if (!log) throw new Error('Merge log not found');
    if (log.clinicId.toString() !== clinicId) throw new Error('Merge log does not belong to your clinic');
    if (log.undoneAt) throw new Error('This merge has already been undone');

    const session = await PatientModel.startSession();
    try {
      await session.withTransaction(async () => {
        const { primarySnapshot, duplicateSnapshot, primaryId, duplicateId } = log;

        // Restore primary — strip _id (Mongoose handles it), keep all other fields
        const { _id: _pid, __v: _pv, ...primaryFields } = primarySnapshot as any;
        await PatientModel.findByIdAndUpdate(primaryId, { $set: primaryFields }, { session });

        // Restore duplicate — reactivate and clear merge flags
        const { _id: _did, __v: _dv, ...duplicateFields } = duplicateSnapshot as any;
        duplicateFields.isActive = true;
        duplicateFields.isDuplicate = false;
        delete duplicateFields.mergedInto;
        await PatientModel.findByIdAndUpdate(duplicateId, { $set: duplicateFields }, { session });

        // Re-parent encounters back to duplicate
        await EncounterModel.updateMany(
          { patientId: primaryId, createdAt: { $gte: log.mergedAt } },
          { $set: { patientId: duplicateId } },
          { session }
        );

        // Mark log as undone
        log.undoneBy = new Types.ObjectId(userId);
        log.undoneAt = new Date();
        await log.save({ session });
      });
    } finally {
      await session.endSession();
    }

    auditLog({
      action: 'PATIENT_UNMERGE',
      userId,
      clinicId,
      resourceType: 'Patient',
      resourceId: String(log.primaryId),
      metadata: { mergeLogId, duplicateId: String(log.duplicateId) },
    }).catch((err) => logger.error({ err }, 'Failed to write PATIENT_UNMERGE audit log'));
  }

  static async getMergedPatient(patientId: string) {
    const patient = await PatientModel.findById(patientId);
    if (!patient) throw new Error('Patient not found');
    if ((patient as any).isDuplicate && (patient as any).mergedInto) {
      return PatientModel.findById((patient as any).mergedInto);
    }
    return patient;
  }
}
