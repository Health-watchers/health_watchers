import { CronJob } from 'cron';
import { immunizationComplianceService } from './immunization-compliance.service';
import { ClinicModel } from '../clinics/clinic.model';
import logger from '@api/utils/logger';

/**
 * Daily immunization compliance job
 * Runs at 2 AM UTC every day to identify overdue immunizations
 */
export function startImmunizationComplianceJob(): CronJob {
  const job = new CronJob('0 2 * * *', async () => {
    try {
      logger.info('Starting immunization compliance job');

      const clinics = await ClinicModel.find({ isActive: true }).lean();

      for (const clinic of clinics) {
        await immunizationComplianceService.runDailyComplianceJob(clinic._id.toString());
      }

      logger.info('Immunization compliance job completed');
    } catch (err) {
      logger.error({ err }, 'Immunization compliance job failed');
    }
  });

  job.start();
  return job;
}
