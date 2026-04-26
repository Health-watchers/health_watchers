import { Request, Response } from 'express';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { anonymizeBatch, createAuditLog, type PatientData } from '@health-watchers/anonymize';
import { AuditService } from '@api/modules/audit/audit.service';

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
      const patientData: PatientData[] = patients.map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        contactNumber: p.contactNumber,
        address: p.address,
        email: p.email,
        systemId: p.systemId,
        sex: p.sex,
      }));
      
      // Apply Level 3 anonymization (aggregation only)
      const anonymizedData = anonymizeBatch(patientData, {
        level: 'aggregation',
        purpose: 'research',
      });
      
      // Optionally include encounter statistics
      let encounterStats = {};
      if (includeEncounters === 'true') {
        const encounters = await EncounterModel.find({}).lean();
        encounterStats = {
          totalEncounters: encounters.length,
          encountersByType: encounters.reduce((acc: Record<string, number>, e: any) => {
            const type = e.encounterType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {}),
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
        resource: 'research',
        resourceId: 'export',
        details: {
          recordCount: patients.length,
          anonymizationLevel: 'aggregation',
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
          exportedAt: new Date().toISOString(),
          anonymizationLevel: 'aggregation',
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
