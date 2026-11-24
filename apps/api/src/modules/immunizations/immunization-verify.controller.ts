import { Request, Response } from 'express';
import { asyncHandler } from '@api/utils/asyncHandler';
import { ImmunizationModel } from './immunization.model';
import { PatientModel } from '../patients/models/patient.model';
import { ClinicModel } from '../clinics/clinic.model';
import logger from '../../utils/logger';

/**
 * GET /verify/immunization/:token
 *
 * Public endpoint — no authentication required.
 * Looks up an immunization record by its `verificationToken` field.
 *
 * Response shape:
 *   - not found  → { valid: false, status: 'not_found' }
 *   - revoked    → { valid: false, status: 'revoked' }
 *   - expired    → { valid: false, status: 'expired' }
 *   - valid      → { valid: true,  status: 'valid', data: { … } }
 */
export const verifyImmunizationCertificate = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params;

    logger.info({ token, ip: req.ip }, '[verify] immunization certificate lookup');

    // The ImmunizationModel schema predates the verificationToken field.
    // We query the raw collection using a typed lean result that extends
    // IImmunization with the optional certificate fields.
    type ImmunizationWithCert = {
      _id: unknown;
      patientId: unknown;
      clinicId: unknown;
      vaccineName: string;
      administeredDate: Date;
      isActive: boolean;
      isRevoked?: boolean;
      verificationToken?: string;
      certificateExpiresAt?: Date;
      nextDueDate?: Date;
    };
    const immunization = await ImmunizationModel.findOne(
      { verificationToken: token } as Parameters<typeof ImmunizationModel.findOne>[0]
    )
      .lean()
      .exec() as ImmunizationWithCert | null;

    if (!immunization) {
      res.status(200).json({ valid: false, status: 'not_found' });
      return;
    }

    // ── Revocation check ────────────────────────────────────────────────────
    if (immunization.isRevoked === true) {
      res.status(200).json({ valid: false, status: 'revoked' });
      return;
    }

    // ── Expiry check ────────────────────────────────────────────────────────
    const now = new Date();
    if (immunization.certificateExpiresAt && new Date(immunization.certificateExpiresAt) < now) {
      res.status(200).json({ valid: false, status: 'expired' });
      return;
    }

    // ── Fetch related records ───────────────────────────────────────────────
    const [patient, clinic] = await Promise.all([
      PatientModel.findById(immunization.patientId).lean(),
      ClinicModel.findById(immunization.clinicId).lean(),
    ]);

    if (!patient || !clinic) {
      // Data integrity issue — treat as not found rather than exposing internals
      logger.warn(
        { immunizationId: immunization._id, token },
        '[verify] patient or clinic not found for valid token'
      );
      res.status(200).json({ valid: false, status: 'not_found' });
      return;
    }

    // ── Build privacy-safe initials ─────────────────────────────────────────
    const firstInitial = (patient.firstName ?? '').charAt(0).toUpperCase();
    const lastInitial = (patient.lastName ?? '').charAt(0).toUpperCase();
    const patientInitials = `${firstInitial}.${lastInitial}.`;

    res.status(200).json({
      valid: true,
      status: 'valid',
      data: {
        patientInitials,
        vaccineName: immunization.vaccineName,
        administeredDate: immunization.administeredDate,
        nextDueDate: immunization.nextDueDate ?? null,
        issuingClinicName: clinic.name,
        issuingClinicPhone: clinic.contactNumber ?? clinic.phone ?? null,
        certificateId: String(immunization._id),
      },
    });
  }
);
