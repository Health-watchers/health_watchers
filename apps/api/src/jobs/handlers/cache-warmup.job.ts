import { ClinicModel } from '../../modules/clinics/clinic.model';
import { registerPatientListWarmup } from '../../services/cache.service';
import logger from '../../utils/logger';

/**
 * Cache warm-up job — runs once per deploy across replicas.
 *
 * Queries recently active clinics (updated in the last 24 hours),
 * registers patient-list warmup entries, and fills cold cache keys.
 *
 * The BullMQ scheduler ensures this job executes at most once per
 * tick across the fleet. Each replica upserts the same deterministic
 * scheduler, so only one tick is materialised and processed.
 */
export async function runCacheWarmupJob(): Promise<void> {
  const recentlyActive = await ClinicModel.find({
    isActive: true,
    updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  })
    .select('_id')
    .lean();

  logger.info(
    { count: recentlyActive.length },
    '[cache-warmup] registering warmup entries for recently active clinics'
  );

  for (const clinic of recentlyActive) {
    registerPatientListWarmup(String(clinic._id));
  }

  const { warmCache } = await import('../../services/cache.service');
  await warmCache();

  logger.info('[cache-warmup] completed');
}
