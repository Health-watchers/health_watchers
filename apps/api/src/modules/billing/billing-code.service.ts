/**
 * Billing code assignment (Issue #1245)
 *
 * Assigns CPT and SNOMED CT codes to line items and diagnoses. The catalog
 * matching functions are pure and unit-tested; the async entry points consult
 * the seeded CPT collection when available and fall back to the catalog so
 * billing never blocks on reference data being loaded.
 */
import { CPTModel } from '../cpt/cpt.model';

export interface DiagnosisInput {
  code: string; // ICD-10 code, e.g. E11.9
  description?: string;
  isPrimary?: boolean;
}

export interface AssignedCptCode {
  code: string;
  description: string;
  category: string;
  defaultFee: string;
  matchedDescription: string;
  confidence: number;
}

export interface AssignedSnomedCode {
  code: string;
  description: string;
  matchedDiagnosis: string;
  confidence: number;
}

export interface BillingCodeAssignment {
  cptCodes: AssignedCptCode[];
  snomedCodes: AssignedSnomedCode[];
  assignedAt: string;
}

/** Mirror of the CPT seed data — used as an offline fallback for assignment. */
export const CPT_CATALOG: Array<{
  code: string;
  description: string;
  category: string;
  defaultFee: string;
}> = [
  {
    code: '99201',
    description: 'Office visit, new patient, straightforward',
    category: 'office-visit',
    defaultFee: '75.00',
  },
  {
    code: '99202',
    description: 'Office visit, new patient, low complexity',
    category: 'office-visit',
    defaultFee: '110.00',
  },
  {
    code: '99203',
    description: 'Office visit, new patient, moderate complexity',
    category: 'office-visit',
    defaultFee: '150.00',
  },
  {
    code: '99204',
    description: 'Office visit, new patient, moderate to high complexity',
    category: 'office-visit',
    defaultFee: '210.00',
  },
  {
    code: '99205',
    description: 'Office visit, new patient, high complexity',
    category: 'office-visit',
    defaultFee: '280.00',
  },
  {
    code: '99211',
    description: 'Office visit, established patient, minimal',
    category: 'office-visit',
    defaultFee: '45.00',
  },
  {
    code: '99212',
    description: 'Office visit, established patient, straightforward',
    category: 'office-visit',
    defaultFee: '75.00',
  },
  {
    code: '99213',
    description: 'Office visit, established patient, low complexity',
    category: 'office-visit',
    defaultFee: '110.00',
  },
  {
    code: '99214',
    description: 'Office visit, established patient, moderate complexity',
    category: 'office-visit',
    defaultFee: '165.00',
  },
  {
    code: '99215',
    description: 'Office visit, established patient, high complexity',
    category: 'office-visit',
    defaultFee: '220.00',
  },
  {
    code: '99381',
    description: 'Preventive care, new patient, infant (under 1 year)',
    category: 'preventive-care',
    defaultFee: '150.00',
  },
  {
    code: '99382',
    description: 'Preventive care, new patient, child (1-4 years)',
    category: 'preventive-care',
    defaultFee: '160.00',
  },
  {
    code: '99383',
    description: 'Preventive care, new patient, child (5-11 years)',
    category: 'preventive-care',
    defaultFee: '170.00',
  },
  {
    code: '99384',
    description: 'Preventive care, new patient, adolescent (12-17 years)',
    category: 'preventive-care',
    defaultFee: '180.00',
  },
  {
    code: '99385',
    description: 'Preventive care, new patient, adult (18-39 years)',
    category: 'preventive-care',
    defaultFee: '190.00',
  },
  {
    code: '99386',
    description: 'Preventive care, new patient, adult (40-64 years)',
    category: 'preventive-care',
    defaultFee: '210.00',
  },
  {
    code: '99387',
    description: 'Preventive care, new patient, senior (65+ years)',
    category: 'preventive-care',
    defaultFee: '220.00',
  },
  {
    code: '99391',
    description: 'Preventive care, established patient, infant (under 1 year)',
    category: 'preventive-care',
    defaultFee: '130.00',
  },
  {
    code: '99392',
    description: 'Preventive care, established patient, child (1-4 years)',
    category: 'preventive-care',
    defaultFee: '140.00',
  },
  {
    code: '99393',
    description: 'Preventive care, established patient, child (5-11 years)',
    category: 'preventive-care',
    defaultFee: '150.00',
  },
  {
    code: '99394',
    description: 'Preventive care, established patient, adolescent (12-17 years)',
    category: 'preventive-care',
    defaultFee: '160.00',
  },
  {
    code: '99395',
    description: 'Preventive care, established patient, adult (18-39 years)',
    category: 'preventive-care',
    defaultFee: '170.00',
  },
  {
    code: '99396',
    description: 'Preventive care, established patient, adult (40-64 years)',
    category: 'preventive-care',
    defaultFee: '190.00',
  },
  {
    code: '99397',
    description: 'Preventive care, established patient, senior (65+ years)',
    category: 'preventive-care',
    defaultFee: '200.00',
  },
  {
    code: '93000',
    description: 'Electrocardiogram (ECG), complete',
    category: 'procedure',
    defaultFee: '85.00',
  },
  {
    code: '85025',
    description: 'Complete blood count (CBC) with differential',
    category: 'lab',
    defaultFee: '45.00',
  },
  {
    code: '80053',
    description: 'Comprehensive metabolic panel',
    category: 'lab',
    defaultFee: '65.00',
  },
  {
    code: '36415',
    description: 'Venipuncture (blood draw)',
    category: 'procedure',
    defaultFee: '25.00',
  },
  {
    code: '94010',
    description: 'Spirometry (lung function test)',
    category: 'procedure',
    defaultFee: '95.00',
  },
  {
    code: '71045',
    description: 'Chest X-ray, single view',
    category: 'imaging',
    defaultFee: '120.00',
  },
  {
    code: '71046',
    description: 'Chest X-ray, two views',
    category: 'imaging',
    defaultFee: '150.00',
  },
  {
    code: '73610',
    description: 'Ankle X-ray, complete',
    category: 'imaging',
    defaultFee: '130.00',
  },
];

/** SNOMED CT concepts keyed by ICD-10 category prefix. */
const SNOMED_ICD10_MAP: Record<string, { code: string; description: string }> = {
  E10: { code: '46635009', description: 'Type 1 diabetes mellitus' },
  E11: { code: '44054006', description: 'Type 2 diabetes mellitus' },
  E13: { code: '73211009', description: 'Diabetes mellitus' },
  I10: { code: '38341003', description: 'Essential hypertension' },
  I11: { code: '38341003', description: 'Essential hypertension' },
  J00: { code: '82272006', description: 'Common cold' },
  J01: { code: '44465007', description: 'Acute sinusitis' },
  J02: { code: '363746003', description: 'Acute pharyngitis' },
  J03: { code: '195662009', description: 'Acute tonsillitis' },
  M79: { code: '279031007', description: 'Pain in limb' },
  R00: { code: '80393002', description: 'Abnormal heart beat' },
  R01: { code: '106063002', description: 'Heart murmur' },
  R02: { code: '31263009', description: 'Gangrene' },
  R03: { code: '10289002', description: 'Abnormal blood pressure reading' },
  Z00: { code: '162859008', description: 'General examination' },
  Z01: { code: '162859008', description: 'General examination' },
};

/** SNOMED concepts matched by free-text keywords in a diagnosis description. */
const SNOMED_KEYWORD_MAP: Array<{ keywords: string[]; code: string; description: string }> = [
  { keywords: ['headache', 'migraine', 'cephalalgia'], code: '25064002', description: 'Headache' },
  { keywords: ['fever', 'pyrexia', 'hyperthermia'], code: '386661006', description: 'Fever' },
  { keywords: ['influenza', 'flu'], code: '90560007', description: 'Influenza' },
  {
    keywords: ['arthritis', 'arthralgia', 'joint pain', 'osteoarthritis'],
    code: '3723001',
    description: 'Arthritis',
  },
  {
    keywords: ['hypertension', 'high blood pressure'],
    code: '38341003',
    description: 'Essential hypertension',
  },
  { keywords: ['diabetes'], code: '73211009', description: 'Diabetes mellitus' },
  { keywords: ['asthma'], code: '195967001', description: 'Asthma' },
  { keywords: ['cough'], code: '49727002', description: 'Cough' },
  { keywords: ['sore throat', 'pharyngitis'], code: '363746003', description: 'Acute pharyngitis' },
  { keywords: ['chest pain', 'angina'], code: '29857009', description: 'Chest pain' },
  { keywords: ['abdominal pain'], code: '21522001', description: 'Abdominal pain' },
  { keywords: ['nausea'], code: '422587007', description: 'Nausea' },
  { keywords: ['dizziness', 'vertigo'], code: '404640003', description: 'Dizziness' },
  { keywords: ['rash', 'dermatitis'], code: '271807003', description: 'Rash' },
  { keywords: ['anxiety'], code: '197480006', description: 'Anxiety' },
  { keywords: ['depression'], code: '35489007', description: 'Depressive disorder' },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a free-text procedure description to a CPT catalog entry using token
 * overlap scoring. Returns the best match or null when nothing plausibly matches.
 */
export function matchCptFromCatalog(
  description: string,
  catalog: Array<{
    code: string;
    description: string;
    category: string;
    defaultFee: string;
  }> = CPT_CATALOG
): AssignedCptCode | null {
  if (!description || !description.trim()) return null;
  const tokens = normalize(description)
    .split(' ')
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return null;

  let best: { entry: (typeof catalog)[number]; score: number } | null = null;
  for (const entry of catalog) {
    const entryTokens = normalize(entry.description)
      .split(' ')
      .filter((t) => t.length > 2);
    if (entryTokens.length === 0) continue;
    const hits = entryTokens.filter((t) => tokens.includes(t)).length;
    const score = hits / Math.max(entryTokens.length, 1);
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  if (!best) return null;

  return {
    code: best.entry.code,
    description: best.entry.description,
    category: best.entry.category,
    defaultFee: best.entry.defaultFee,
    matchedDescription: description,
    confidence: Math.round(best.score * 100) / 100,
  };
}

/** Map a diagnosis (ICD-10 code + optional description) to a SNOMED CT concept. */
export function matchSnomedForDiagnosis(diagnosis: DiagnosisInput): AssignedSnomedCode | null {
  const cleanCode = diagnosis.code.replace(/\./g, '').toUpperCase();

  // 1. Exact or 3-character ICD-10 prefix lookup
  for (const candidate of [cleanCode, cleanCode.slice(0, 3)]) {
    const mapped = SNOMED_ICD10_MAP[candidate];
    if (mapped) {
      return {
        code: mapped.code,
        description: mapped.description,
        matchedDiagnosis: `${diagnosis.code} ${diagnosis.description ?? ''}`.trim(),
        confidence: 1,
      };
    }
  }

  // 2. Keyword match against the diagnosis description
  if (diagnosis.description) {
    const text = normalize(diagnosis.description);
    let best: { match: (typeof SNOMED_KEYWORD_MAP)[number]; score: number } | null = null;
    for (const entry of SNOMED_KEYWORD_MAP) {
      const hits = entry.keywords.filter((k) => text.includes(k)).length;
      if (hits > 0 && (!best || hits > best.score)) {
        best = { match: entry, score: hits };
      }
    }
    if (best) {
      return {
        code: best.match.code,
        description: best.match.description,
        matchedDiagnosis: `${diagnosis.code} ${diagnosis.description}`.trim(),
        confidence: 0.9,
      };
    }
  }

  return null;
}

/**
 * Assign CPT codes to a list of procedure descriptions. Consults the seeded CPT
 * collection first and falls back to the built-in catalog for unmatched items.
 */
export async function assignCptCodes(descriptions: string[]): Promise<AssignedCptCode[]> {
  const results: AssignedCptCode[] = [];

  for (const description of descriptions) {
    let match = matchCptFromCatalog(description);

    if (!match) {
      try {
        const dbHit = await CPTModel.findOne({
          description: { $regex: escapeRegExp(description), $options: 'i' },
        }).lean();
        if (dbHit) {
          match = {
            code: dbHit.code,
            description: dbHit.description,
            category: dbHit.category,
            defaultFee: dbHit.defaultFee,
            matchedDescription: description,
            confidence: 1,
          };
        }
      } catch {
        // Reference data unavailable — rely on the catalog fallback.
      }
    }

    if (match) results.push(match);
  }

  return results;
}

/** Assign SNOMED CT codes to a list of diagnoses. */
export async function assignSnomedCodes(
  diagnoses: DiagnosisInput[]
): Promise<AssignedSnomedCode[]> {
  return diagnoses
    .map((d) => matchSnomedForDiagnosis(d))
    .filter((m): m is AssignedSnomedCode => m !== null);
}

/** Assign both CPT and SNOMED codes for a set of procedures and diagnoses. */
export async function assignBillingCodes(input: {
  diagnoses?: DiagnosisInput[];
  procedures?: string[];
}): Promise<BillingCodeAssignment> {
  const [cptCodes, snomedCodes] = await Promise.all([
    assignCptCodes(input.procedures ?? []),
    assignSnomedCodes(input.diagnoses ?? []),
  ]);

  return { cptCodes, snomedCodes, assignedAt: new Date().toISOString() };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
