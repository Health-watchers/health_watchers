import { Db, IndexSpecification } from 'mongodb';

/**
 * Migration: 20260801_patient_encounter_text_search
 *
 * Adds full-text search support for patient and encounter records (#1604).
 *
 * Up:
 *  - Drops the existing `patients_text_search` index (if present).
 *  - Creates a compound text index on `patients` covering `name`, `phone`,
 *    and `nationalId` with weights (name: 10, phone: 5, nationalId: 5).
 *  - Creates a text index on `encounters` covering `soapNotes`, `diagnosis`,
 *    and `chiefComplaint` with weights (soapNotes: 5, diagnosis: 3,
 *    chiefComplaint: 3).
 *
 * Down:
 *  - Drops both text indexes.
 *  - Restores the prior `patients_text_search` index.
 */

const PATIENTS_COLLECTION = 'patients';
const ENCOUNTERS_COLLECTION = 'encounters';

const PATIENTS_TEXT_INDEX_NAME = 'patients_text_search';
const ENCOUNTERS_TEXT_INDEX_NAME = 'encounters_text_search';

/**
 * The prior `patients_text_search` index definition that existed before this
 * migration. Used by `down()` to restore the previous state.
 */
const PRIOR_PATIENTS_TEXT_INDEX: IndexSpecification = {
  name: PATIENTS_TEXT_INDEX_NAME,
  key: {
    name: 'text',
    phone: 'text',
  },
  weights: {
    name: 10,
    phone: 5,
  },
};

/**
 * New compound text index for patients.
 */
const PATIENTS_TEXT_INDEX: IndexSpecification = {
  name: PATIENTS_TEXT_INDEX_NAME,
  key: {
    name: 'text',
    phone: 'text',
    nationalId: 'text',
  },
  weights: {
    name: 10,
    phone: 5,
    nationalId: 5,
  },
  default_language: 'english',
};

/**
 * New text index for encounters.
 */
const ENCOUNTERS_TEXT_INDEX: IndexSpecification = {
  name: ENCOUNTERS_TEXT_INDEX_NAME,
  key: {
    soapNotes: 'text',
    diagnosis: 'text',
    chiefComplaint: 'text',
  },
  weights: {
    soapNotes: 5,
    diagnosis: 3,
    chiefComplaint: 3,
  },
  default_language: 'english',
};

/**
 * Safely drop an index by name, ignoring "index not found" errors.
 */
async function dropIndexIfExists(
  db: Db,
  collectionName: string,
  indexName: string,
): Promise<void> {
  const collection = db.collection(collectionName);
  try {
    await collection.dropIndex(indexName);
  } catch (error) {
    const err = error as { code?: number; codeName?: string; message?: string };
    // 27 = IndexNotFound
    const isIndexNotFound =
      err?.code === 27 ||
      err?.codeName === 'IndexNotFound' ||
      (typeof err?.message === 'string' &&
        err.message.includes('index not found'));
    if (!isIndexNotFound) {
      throw error;
    }
  }
}

/**
 * Create an index, tolerating the case where an equivalent index already
 * exists (e.g. re-running the migration).
 */
async function createIndexIfNotExists(
  db: Db,
  collectionName: string,
  spec: IndexSpecification,
): Promise<void> {
  const collection = db.collection(collectionName);
  try {
    await collection.createIndex(spec.key, {
      name: spec.name,
      weights: spec.weights,
      default_language: spec.default_language,
    });
  } catch (error) {
    const err = error as { code?: number; codeName?: string; message?: string };
    // 85 = IndexOptionsConflict, 86 = IndexKeySpecsConflict
    const isConflict =
      err?.code === 85 ||
      err?.code === 86 ||
      err?.codeName === 'IndexOptionsConflict' ||
      err?.codeName === 'IndexKeySpecsConflict';
    if (!isConflict) {
      throw error;
    }
  }
}

export async function up(db: Db): Promise<void> {
  // (a) Patients: drop the existing text index and recreate as a compound
  // text index covering name, phone, and nationalId.
  await dropIndexIfExists(db, PATIENTS_COLLECTION, PATIENTS_TEXT_INDEX_NAME);
  await createIndexIfNotExists(db, PATIENTS_COLLECTION, PATIENTS_TEXT_INDEX);

  // (b) Encounters: create a text index covering soapNotes, diagnosis, and
  // chiefComplaint.
  await dropIndexIfExists(db, ENCOUNTERS_COLLECTION, ENCOUNTERS_TEXT_INDEX_NAME);
  await createIndexIfNotExists(db, ENCOUNTERS_COLLECTION, ENCOUNTERS_TEXT_INDEX);
}

export async function down(db: Db): Promise<void> {
  // Drop the new encounter text index.
  await dropIndexIfExists(db, ENCOUNTERS_COLLECTION, ENCOUNTERS_TEXT_INDEX_NAME);

  // Drop the new compound patients text index and restore the prior one.
  await dropIndexIfExists(db, PATIENTS_COLLECTION, PATIENTS_TEXT_INDEX_NAME);
  await createIndexIfNotExists(
    db,
    PATIENTS_COLLECTION,
    PRIOR_PATIENTS_TEXT_INDEX,
  );
}

export default { up, down };