import { Request, Response } from 'express';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import {
  anonymizeBatch,
  createAuditLog,
  applyKAnonymity,
  addDifferentialPrivacyNoise,
  type PatientData,
} from '@health-watchers/anonymize';
import { AuditService } from '@api/modules/audit/audit.service';

/** Minimum group size for k-anonymity on research exports. */
const RESEARCH_K = 5;
/** Privacy budget (epsilon) for differential privacy on aggregate statistics. */
const RESEARCH_DP_EPSILON = 1.0;

export class ResearchController {
  /**
   * Export anonymized dataset for research
   * GET /api/v1/research/export
   * Requires: SUPER_ADMIN role
   */
  static async exportAnonymizedData(req: Request, res: Response): Promise<void> {
    try {
      const { irbApproval, includeEncounters } = req.query;

      // Validate IRB approval flag
      if (irbApproval !== 'true') {
        res.status(400).json({
          success: false,
          message: 'IRB approval flag is required for research data export',
        });
        return;
      }

      // Fetch all patients
      const patients = await PatientModel.find({ isActive: true }).lean();

      // Convert to PatientData format
      const patientData: PatientData[] = patients.map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        contactNumber: p.contactNumber,
        address: p.address,
        email: (p as any).email,
        systemId: p.systemId,
        sex: p.sex,
      }));

      // Apply Level 3 anonymization (aggregation only)
      const anonymizedData = anonymizeBatch(patientData, {
        level: 'aggregation',
        purpose: 'research',
      });

      // Enforce k-anonymity on quasi-identifiers: generalize age/sex/location
      // and suppress any equivalence class smaller than RESEARCH_K.
      const kAnonymized = applyKAnonymity(patientData, {
        k: RESEARCH_K,
        quasiIdentifiers: ['age', 'sex', 'address'],
      });

      // Optionally include encounter statistics
      let encounterStats = {};
      if (includeEncounters === 'true') {
        const encounters = await EncounterModel.find({}).lean();
        const encountersByType = encounters.reduce((acc: Record<string, number>, e: any) => {
          const type = e.encounterType || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        // Add Laplace noise to aggregate counts so individual records cannot
        // be inferred from published statistics (differential privacy).
        const noisyByType = addDifferentialPrivacyNoise(encountersByType, {
          epsilon: RESEARCH_DP_EPSILON,
        });
        encounterStats = {
          totalEncounters: addDifferentialPrivacyNoise(
            { total: encounters.length },
            { epsilon: RESEARCH_DP_EPSILON }
          ).total,
          encountersByType: noisyByType,
        };
      }

      // Create audit log
      const auditLog = createAuditLog(
        ['firstName', 'lastName', 'dateOfBirth', 'contactNumber', 'address', 'email', 'systemId'],
        'research export',
        req.user?.userId || 'unknown',
        'aggregation',
        patients.length
      );

      // Log to audit service
      await AuditService.log({
        userId: req.user?.userId,
        clinicId: req.user?.clinicId,
        action: 'research_export',
        resourceType: 'research',
        resourceId: 'export',
        metadata: {
          recordCount: patients.length,
          anonymizationLevel: 'aggregation',
          kAnonymity: RESEARCH_K,
          differentialPrivacyEpsilon: RESEARCH_DP_EPSILON,
          irbApproval: true,
          includeEncounters: includeEncounters === 'true',
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(200).json({
        success: true,
        data: {
          ...anonymizedData,
          ...encounterStats,
          kAnonymized,
          exportedAt: new Date().toISOString(),
          anonymizationLevel: 'aggregation',
          kAnonymity: RESEARCH_K,
          differentialPrivacyEpsilon: RESEARCH_DP_EPSILON,
          auditLog,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        message: `Failed to export research data: ${message}`,
      });
    }
  }
}
