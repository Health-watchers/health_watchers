import { immunizationComplianceService } from './immunization-compliance.service';
import { ClinicModel } from '../clinics/clinic.model';
import logger from '@api/utils/logger';

/**
 * Daily immunization compliance job — identifies overdue immunizations for
 * every active clinic. Scheduled through the JobRegistry
 * (`immunization-compliance`, 02:00 UTC daily).
 */
export async function runImmunizationComplianceJob(): Promise<void> {
  logger.info('Starting immunization compliance job');

  const clinics = await ClinicModel.find({ isActive: true }).lean();

  for (const clinic of clinics) {
    await immunizationComplianceService.runDailyComplianceJob(clinic._id.toString());
  }

  logger.info('Immunization compliance job completed');
}
