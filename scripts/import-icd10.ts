/**
 * scripts/import-icd10.ts
 *
 * Imports ICD-10-CM codes into MongoDB.
 * Uses a curated subset of common codes for seeding; replace with full CMS dataset for production.
 *
 * Usage:
 *   npx ts-node -P scripts/tsconfig.seed.json scripts/import-icd10.ts
 *
 * The script is idempotent — safe to run multiple times (upserts by code).
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/health_watchers';

interface ICD10Entry {
  code: string;
  description: string;
  category: string;
  chapter: string;
  isValid: boolean;
}

// Representative sample of ICD-10-CM codes (2024 edition).
// In production, replace with the full CMS dataset parsed from the official XML/tabular file.
const ICD10_CODES: ICD10Entry[] = [
  // Chapter I — Certain infectious and parasitic diseases (A00–B99)
  {
    code: 'A00.0',
    description: 'Cholera due to Vibrio cholerae 01, biovar cholerae',
    category: 'A00',
    chapter: 'Certain infectious and parasitic diseases',
    isValid: true,
  },
  {
    code: 'A09',
    description: 'Other and unspecified gastroenteritis and colitis of infectious origin',
    category: 'A09',
    chapter: 'Certain infectious and parasitic diseases',
    isValid: true,
  },
  {
    code: 'B34.9',
    description: 'Viral infection, unspecified',
    category: 'B34',
    chapter: 'Certain infectious and parasitic diseases',
    isValid: true,
  },

  // Chapter II — Neoplasms (C00–D49)
  {
    code: 'C34.10',
    description: 'Malignant neoplasm of upper lobe, bronchus or lung, unspecified side',
    category: 'C34',
    chapter: 'Neoplasms',
    isValid: true,
  },
  {
    code: 'C50.911',
    description: 'Malignant neoplasm of unspecified site of right female breast',
    category: 'C50',
    chapter: 'Neoplasms',
    isValid: true,
  },

  // Chapter III — Diseases of the blood (D50–D89)
  {
    code: 'D50.9',
    description: 'Iron deficiency anemia, unspecified',
    category: 'D50',
    chapter: 'Diseases of the blood and blood-forming organs',
    isValid: true,
  },
  {
    code: 'D64.9',
    description: 'Anemia, unspecified',
    category: 'D64',
    chapter: 'Diseases of the blood and blood-forming organs',
    isValid: true,
  },

  // Chapter IV — Endocrine, nutritional and metabolic diseases (E00–E89)
  {
    code: 'E11.9',
    description: 'Type 2 diabetes mellitus without complications',
    category: 'E11',
    chapter: 'Endocrine, nutritional and metabolic diseases',
    isValid: true,
  },
  {
    code: 'E11.65',
    description: 'Type 2 diabetes mellitus with hyperglycemia',
    category: 'E11',
    chapter: 'Endocrine, nutritional and metabolic diseases',
    isValid: true,
  },
  {
    code: 'E78.5',
    description: 'Hyperlipidemia, unspecified',
    category: 'E78',
    chapter: 'Endocrine, nutritional and metabolic diseases',
    isValid: true,
  },
  {
    code: 'E66.9',
    description: 'Obesity, unspecified',
    category: 'E66',
    chapter: 'Endocrine, nutritional and metabolic diseases',
    isValid: true,
  },

  // Chapter V — Mental and behavioural disorders (F01–F99)
  {
    code: 'F32.9',
    description: 'Major depressive disorder, single episode, unspecified',
    category: 'F32',
    chapter: 'Mental, Behavioral and Neurodevelopmental disorders',
    isValid: true,
  },
  {
    code: 'F41.1',
    description: 'Generalized anxiety disorder',
    category: 'F41',
    chapter: 'Mental, Behavioral and Neurodevelopmental disorders',
    isValid: true,
  },
  {
    code: 'F10.10',
    description: 'Alcohol abuse, uncomplicated',
    category: 'F10',
    chapter: 'Mental, Behavioral and Neurodevelopmental disorders',
    isValid: true,
  },

  // Chapter VI — Diseases of the nervous system (G00–G99)
  {
    code: 'G43.909',
    description: 'Migraine, unspecified, not intractable, without status migrainosus',
    category: 'G43',
    chapter: 'Diseases of the nervous system',
    isValid: true,
  },
  {
    code: 'G89.29',
    description: 'Other chronic pain',
    category: 'G89',
    chapter: 'Diseases of the nervous system',
    isValid: true,
  },

  // Chapter VII — Diseases of the eye (H00–H59)
  {
    code: 'H26.9',
    description: 'Unspecified cataract',
    category: 'H26',
    chapter: 'Diseases of the eye and adnexa',
    isValid: true,
  },

  // Chapter VIII — Diseases of the ear (H60–H95)
  {
    code: 'H66.90',
    description: 'Otitis media, unspecified, unspecified ear',
    category: 'H66',
    chapter: 'Diseases of the ear and mastoid process',
    isValid: true,
  },

  // Chapter IX — Diseases of the circulatory system (I00–I99)
  {
    code: 'I10',
    description: 'Essential (primary) hypertension',
    category: 'I10',
    chapter: 'Diseases of the circulatory system',
    isValid: true,
  },
  {
    code: 'I25.10',
    description: 'Atherosclerotic heart disease of native coronary artery without angina pectoris',
    category: 'I25',
    chapter: 'Diseases of the circulatory system',
    isValid: true,
  },
  {
    code: 'I50.9',
    description: 'Heart failure, unspecified',
    category: 'I50',
    chapter: 'Diseases of the circulatory system',
    isValid: true,
  },
  {
    code: 'I63.9',
    description: 'Cerebral infarction, unspecified',
    category: 'I63',
    chapter: 'Diseases of the circulatory system',
    isValid: true,
  },

  // Chapter X — Diseases of the respiratory system (J00–J99)
  {
    code: 'J00',
    description: 'Acute nasopharyngitis [common cold]',
    category: 'J00',
    chapter: 'Diseases of the respiratory system',
    isValid: true,
  },
  {
    code: 'J06.9',
    description: 'Acute upper respiratory infection, unspecified',
    category: 'J06',
    chapter: 'Diseases of the respiratory system',
    isValid: true,
  },
  {
    code: 'J18.9',
    description: 'Pneumonia, unspecified organism',
    category: 'J18',
    chapter: 'Diseases of the respiratory system',
    isValid: true,
  },
  {
    code: 'J45.20',
    description: 'Mild intermittent asthma, uncomplicated',
    category: 'J45',
    chapter: 'Diseases of the respiratory system',
    isValid: true,
  },
  {
    code: 'J44.1',
    description: 'Chronic obstructive pulmonary disease with (acute) exacerbation',
    category: 'J44',
    chapter: 'Diseases of the respiratory system',
    isValid: true,
  },

  // Chapter XI — Diseases of the digestive system (K00–K95)
  {
    code: 'K21.0',
    description: 'Gastro-esophageal reflux disease with esophagitis',
    category: 'K21',
    chapter: 'Diseases of the digestive system',
    isValid: true,
  },
  {
    code: 'K29.70',
    description: 'Gastritis, unspecified, without bleeding',
    category: 'K29',
    chapter: 'Diseases of the digestive system',
    isValid: true,
  },
  {
    code: 'K57.30',
    description:
      'Diverticulosis of large intestine without perforation or abscess without bleeding',
    category: 'K57',
    chapter: 'Diseases of the digestive system',
    isValid: true,
  },

  // Chapter XII — Diseases of the skin (L00–L99)
  {
    code: 'L30.9',
    description: 'Dermatitis, unspecified',
    category: 'L30',
    chapter: 'Diseases of the skin and subcutaneous tissue',
    isValid: true,
  },

  // Chapter XIII — Diseases of the musculoskeletal system (M00–M99)
  {
    code: 'M54.5',
    description: 'Low back pain',
    category: 'M54',
    chapter: 'Diseases of the musculoskeletal system and connective tissue',
    isValid: true,
  },
  {
    code: 'M17.11',
    description: 'Primary osteoarthritis, right knee',
    category: 'M17',
    chapter: 'Diseases of the musculoskeletal system and connective tissue',
    isValid: true,
  },
  {
    code: 'M79.3',
    description: 'Panniculitis, unspecified',
    category: 'M79',
    chapter: 'Diseases of the musculoskeletal system and connective tissue',
    isValid: true,
  },

  // Chapter XIV — Diseases of the genitourinary system (N00–N99)
  {
    code: 'N39.0',
    description: 'Urinary tract infection, site not specified',
    category: 'N39',
    chapter: 'Diseases of the genitourinary system',
    isValid: true,
  },
  {
    code: 'N18.3',
    description: 'Chronic kidney disease, stage 3 (moderate)',
    category: 'N18',
    chapter: 'Diseases of the genitourinary system',
    isValid: true,
  },

  // Chapter XV — Pregnancy, childbirth (O00–O9A)
  {
    code: 'O80',
    description: 'Encounter for full-term uncomplicated delivery',
    category: 'O80',
    chapter: 'Pregnancy, childbirth and the puerperium',
    isValid: true,
  },

  // Chapter XVIII — Symptoms and signs (R00–R99)
  {
    code: 'R05.9',
    description: 'Cough, unspecified',
    category: 'R05',
    chapter: 'Symptoms, signs and abnormal clinical and laboratory findings',
    isValid: true,
  },
  {
    code: 'R50.9',
    description: 'Fever, unspecified',
    category: 'R50',
    chapter: 'Symptoms, signs and abnormal clinical and laboratory findings',
    isValid: true,
  },
  {
    code: 'R51.9',
    description: 'Headache, unspecified',
    category: 'R51',
    chapter: 'Symptoms, signs and abnormal clinical and laboratory findings',
    isValid: true,
  },
  {
    code: 'R10.9',
    description: 'Unspecified abdominal pain',
    category: 'R10',
    chapter: 'Symptoms, signs and abnormal clinical and laboratory findings',
    isValid: true,
  },
  {
    code: 'R06.00',
    description: 'Dyspnea, unspecified',
    category: 'R06',
    chapter: 'Symptoms, signs and abnormal clinical and laboratory findings',
    isValid: true,
  },

  // Chapter XIX — Injury, poisoning (S00–T88)
  {
    code: 'S09.90XA',
    description: 'Unspecified injury of head, initial encounter',
    category: 'S09',
    chapter: 'Injury, poisoning and certain other consequences of external causes',
    isValid: true,
  },

  // Chapter XXI — Factors influencing health status (Z00–Z99)
  {
    code: 'Z00.00',
    description: 'Encounter for general adult medical examination without abnormal findings',
    category: 'Z00',
    chapter: 'Factors influencing health status and contact with health services',
    isValid: true,
  },
  {
    code: 'Z23',
    description: 'Encounter for immunization',
    category: 'Z23',
    chapter: 'Factors influencing health status and contact with health services',
    isValid: true,
  },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Dynamically import model to avoid circular deps
  const { ICD10Model } = await import('../apps/api/src/modules/icd10/icd10.model');

  let upserted = 0;
  for (const entry of ICD10_CODES) {
    await ICD10Model.updateOne({ code: entry.code }, { $set: entry }, { upsert: true });
    upserted++;
  }

  console.log(`✅ Upserted ${upserted} ICD-10 codes`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
