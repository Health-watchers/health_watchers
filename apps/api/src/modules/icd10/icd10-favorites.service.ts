import { Types } from 'mongoose';
import { ClinicICD10FavoritesModel, IICD10Favorite } from './clinic-icd10-favorites.model';
import { ClinicICD10RecentModel } from './clinic-icd10-recent.model';
import logger from '@api/utils/logger';

/** Return the set of favorite codes for a clinic (uppercased). */
export async function getFavoriteCodes(clinicId: string | Types.ObjectId): Promise<string[]> {
  const doc = await ClinicICD10FavoritesModel.findOne({ clinicId }).lean<{
    codes: IICD10Favorite[];
  }>();
  return doc?.codes.map((c) => c.code) ?? [];
}

/** List a clinic's favorites, most-recently added first. */
export async function listFavorites(clinicId: string | Types.ObjectId): Promise<IICD10Favorite[]> {
  const doc = await ClinicICD10FavoritesModel.findOne({ clinicId }).lean<{
    codes: IICD10Favorite[];
  }>();
  const codes = doc?.codes ?? [];
  return [...codes].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
}

/**
 * Add a code to a clinic's favorites. Idempotent: adding an existing code is a
 * no-op (it won't be duplicated). Returns the updated favorites list.
 */
export async function addFavorite(
  clinicId: string | Types.ObjectId,
  code: string,
  description: string,
  addedBy?: string | Types.ObjectId
): Promise<IICD10Favorite[]> {
  const upperCode = code.toUpperCase();

  // Upsert the clinic doc, then conditionally push the code only if absent so we
  // never create duplicates (a single atomic-ish flow that tolerates first use).
  await ClinicICD10FavoritesModel.updateOne(
    { clinicId },
    { $setOnInsert: { clinicId, codes: [] } },
    { upsert: true }
  );

  await ClinicICD10FavoritesModel.updateOne(
    { clinicId, 'codes.code': { $ne: upperCode } },
    {
      $push: {
        codes: { code: upperCode, description, addedBy, addedAt: new Date() },
      },
    }
  );

  return listFavorites(clinicId);
}

/** Remove a code from a clinic's favorites. Returns the updated favorites list. */
export async function removeFavorite(
  clinicId: string | Types.ObjectId,
  code: string
): Promise<IICD10Favorite[]> {
  const upperCode = code.toUpperCase();
  await ClinicICD10FavoritesModel.updateOne(
    { clinicId },
    { $pull: { codes: { code: upperCode } } }
  );
  return listFavorites(clinicId);
}

/**
 * Record that a clinic used an ICD-10 code (e.g. attached it to an encounter).
 * Bumps useCount and lastUsedAt. Best-effort: never throws to the caller.
 */
export async function recordRecentUsage(
  clinicId: string | Types.ObjectId,
  code: string,
  description = ''
): Promise<void> {
  try {
    const upperCode = code.toUpperCase();
    await ClinicICD10RecentModel.updateOne(
      { clinicId, code: upperCode },
      {
        $set: { lastUsedAt: new Date(), ...(description ? { description } : {}) },
        $inc: { useCount: 1 },
        $setOnInsert: { clinicId, code: upperCode },
      },
      { upsert: true }
    );
  } catch (err) {
    logger.warn({ err, code }, '[icd10] failed to record recent usage');
  }
}

/** List a clinic's recently-used codes, most recent first. */
export async function listRecent(clinicId: string | Types.ObjectId, limit = 10) {
  return ClinicICD10RecentModel.find({ clinicId })
    .sort({ lastUsedAt: -1 })
    .limit(Math.min(50, Math.max(1, limit)))
    .select('code description useCount lastUsedAt')
    .lean();
}
