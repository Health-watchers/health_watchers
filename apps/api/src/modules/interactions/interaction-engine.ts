/**
 * Medication interaction engine (Issue #1244)
 *
 * Pure, deterministic detection of drug–drug, drug–allergy, and drug–food
 * interactions with severity classification and human-readable explanations.
 * No database access — fully unit-tested.
 */
import { DRUG_CATALOG, DrugEntry } from './drug-data';
import { INTERACTION_DATA, DrugInteractionRecord, InteractionSeverity } from './interaction-data';
import { FOOD_INTERACTION_DATA, FoodInteractionRecord } from './food-interaction-data';

export { InteractionSeverity };

export interface ResolvedDrug {
  rxCui: string;
  genericName: string;
  brandNames: string[];
  synonyms: string[];
  drugClass: string;
  /** The free-text name that resolved to this drug. */
  matchedName: string;
}

export interface DrugDrugInteraction {
  drugA: string;
  drugB: string;
  severity: InteractionSeverity;
  mechanism: string;
  management: string;
  source: string;
  explanation: string;
}

export interface AllergyInteraction {
  medication: string;
  allergen: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  reaction?: string;
  explanation: string;
}

export interface FoodInteraction {
  medication: string;
  food: string;
  severity: InteractionSeverity;
  effect: string;
  management: string;
  source: string;
  explanation: string;
}

export interface PatientAllergy {
  allergen: string;
  severity?: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  reaction?: string;
}

export interface SafetyCheckResult {
  severity: InteractionSeverity | 'none';
  drugDrugInteractions: DrugDrugInteraction[];
  allergyInteractions: AllergyInteraction[];
  foodInteractions: FoodInteraction[];
  summary: string;
}

const SEVERITY_ORDER: InteractionSeverity[] = ['critical', 'major', 'moderate', 'minor'];

/** Normalize a free-text drug name for matching: lowercase, strip strength/dose. */
export function normalizeDrugName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // strip parenthetical strength/form
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|mEq|units?|iu)\b/g, ' ') // dose with unit
    .replace(
      /\b(tablet|capsule|cap|tab|solution|oral|iv|injection|suspension|cream|ointment|patch|inhaler|spray|syrup)\b/g,
      ' '
    ) // dosage form
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve a single free-text medication string against the catalog. */
export function resolveDrug(
  medication: string,
  catalog: DrugEntry[] = DRUG_CATALOG
): ResolvedDrug | null {
  const normalized = normalizeDrugName(medication);
  if (!normalized) return null;

  for (const entry of catalog) {
    const names = [entry.genericName, ...entry.brandNames, ...entry.synonyms];
    const exact = names.some((n) => normalizeDrugName(n) === normalized);
    if (exact) {
      return { ...entry, matchedName: medication.trim() };
    }
  }

  // Fallback: word-level contains match on generic/brand names
  const tokens = normalized.split(' ').filter((t) => t.length > 2);
  for (const entry of catalog) {
    const names = [entry.genericName, ...entry.brandNames, ...entry.synonyms];
    const entryTokens = names
      .map(normalizeDrugName)
      .join(' ')
      .split(' ')
      .filter((t) => t.length > 2);
    const hits = tokens.filter((t) => entryTokens.includes(t)).length;
    if (hits > 0 && hits >= Math.min(tokens.length, entryTokens.length)) {
      return { ...entry, matchedName: medication.trim() };
    }
  }

  return null;
}

/** Resolve a list of medications, dropping unresolvable entries. */
export function resolveDrugs(
  medications: string[],
  catalog: DrugEntry[] = DRUG_CATALOG
): ResolvedDrug[] {
  const seen = new Set<string>();
  const resolved: ResolvedDrug[] = [];
  for (const medication of medications) {
    const drug = resolveDrug(medication, catalog);
    if (drug && !seen.has(drug.genericName)) {
      seen.add(drug.genericName);
      resolved.push(drug);
    }
  }
  return resolved;
}

/** Human-readable severity label. */
export function severityLabel(severity: InteractionSeverity | 'none'): string {
  switch (severity) {
    case 'critical':
      return 'critical (contraindicated)';
    case 'major':
      return 'major';
    case 'moderate':
      return 'moderate';
    case 'minor':
      return 'minor';
    case 'none':
      return 'no';
  }
}

/** Build a human-readable explanation for a drug–drug interaction. */
export function buildInteractionExplanation(
  drugA: string,
  drugB: string,
  severity: InteractionSeverity,
  mechanism: string,
  management: string
): string {
  return `${drugA} and ${drugB}: ${severityLabel(severity)} interaction. ${mechanism} Management: ${management}`;
}

/** Map an allergy severity label onto the interaction severity scale. */
export function allergySeverityToInteractionSeverity(
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening'
): InteractionSeverity {
  switch (severity) {
    case 'life-threatening':
      return 'critical';
    case 'severe':
      return 'major';
    case 'moderate':
      return 'moderate';
    case 'mild':
      return 'minor';
  }
}

/** Highest severity across a set of interactions ('none' if empty). */
export function classifySeverity(
  interactions: Array<{ severity: string }>
): InteractionSeverity | 'none' {
  const normalized = interactions.map((i) =>
    SEVERITY_ORDER.includes(i.severity as InteractionSeverity)
      ? (i.severity as InteractionSeverity)
      : allergySeverityToInteractionSeverity(
          i.severity as 'mild' | 'moderate' | 'severe' | 'life-threatening'
        )
  );
  for (const level of SEVERITY_ORDER) {
    if (normalized.includes(level)) return level;
  }
  return 'none';
}

/**
 * Detect pairwise drug–drug interactions for a set of resolved drugs.
 * Order-insensitive: each pair is evaluated once regardless of input order.
 */
export function detectDrugDrugInteractions(
  resolved: ResolvedDrug[],
  data: DrugInteractionRecord[] = INTERACTION_DATA
): DrugDrugInteraction[] {
  const interactions: DrugDrugInteraction[] = [];

  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];

      const record = data.find(
        (r) =>
          (r.drugA === a.genericName && r.drugB === b.genericName) ||
          (r.drugA === b.genericName && r.drugB === a.genericName)
      );

      if (record) {
        // Always report the pair in the canonical (data-record) order so the
        // result is identical regardless of input ordering.
        const drugAName = record.drugA;
        const drugBName = record.drugB;
        interactions.push({
          drugA: drugAName,
          drugB: drugBName,
          severity: record.severity,
          mechanism: record.mechanism,
          management: record.management,
          source: record.source,
          explanation: buildInteractionExplanation(
            drugAName,
            drugBName,
            record.severity,
            record.mechanism,
            record.management
          ),
        });
      }
    }
  }

  return interactions;
}

/**
 * Detect whether a medication matches any of the patient's active drug
 * allergies. Matches against generic, brand, and synonym names.
 */
export function detectAllergyInteractions(
  medication: string,
  allergies: PatientAllergy[],
  catalog: DrugEntry[] = DRUG_CATALOG
): AllergyInteraction[] {
  const drug = resolveDrug(medication, catalog);
  if (!drug) return [];

  const drugNames = [drug.genericName, ...drug.brandNames, ...drug.synonyms].map(normalizeDrugName);

  const results: AllergyInteraction[] = [];
  for (const allergy of allergies) {
    const allergenNorm = normalizeDrugName(allergy.allergen);
    if (!allergenNorm) continue;
    if (drugNames.includes(allergenNorm) || allergenNorm.includes(drug.genericName)) {
      const severity = allergy.severity ?? 'moderate';
      results.push({
        medication: drug.genericName,
        allergen: allergy.allergen,
        severity,
        reaction: allergy.reaction,
        explanation: `${drug.genericName} matches a documented ${severity} drug allergy to "${allergy.allergen}"${allergy.reaction ? ` (reaction: ${allergy.reaction})` : ''}. Do not administer without clinical review.`,
      });
    }
  }
  return results;
}

/** Detect food interactions for a resolved medication. */
export function detectFoodInteractions(
  medication: string,
  data: FoodInteractionRecord[] = FOOD_INTERACTION_DATA
): FoodInteraction[] {
  const drug = resolveDrug(medication);
  if (!drug) return [];

  return data
    .filter((r) => r.drug === drug.genericName)
    .map((r) => ({
      medication: drug.genericName,
      food: r.food,
      severity: r.severity,
      effect: r.effect,
      management: r.management,
      source: r.source,
      explanation: `${drug.genericName} and ${r.food}: ${severityLabel(r.severity)} interaction. ${r.effect} Management: ${r.management}`,
    }));
}

/** Build a plain-language summary of a safety check. */
export function buildSafetySummary(
  severity: InteractionSeverity | 'none',
  drugDrugCount: number,
  allergyCount: number,
  foodCount: number
): string {
  const total = drugDrugCount + allergyCount + foodCount;
  if (total === 0) return 'No medication interactions detected.';
  const parts: string[] = [];
  if (drugDrugCount > 0) parts.push(`${drugDrugCount} drug-drug`);
  if (allergyCount > 0) parts.push(`${allergyCount} allergy`);
  if (foodCount > 0) parts.push(`${foodCount} food`);
  return `${total} ${severityLabel(severity)} interaction(s) detected (${parts.join(', ')}). Review before administration.`;
}

/**
 * Full medication safety check: drug–drug, drug–allergy, and drug–food.
 * Pure — callers provide resolved context.
 */
export function checkMedicationSafety(input: {
  medications: string[];
  allergies?: PatientAllergy[];
  includeFood?: boolean;
  catalog?: DrugEntry[];
  interactionData?: DrugInteractionRecord[];
  foodData?: FoodInteractionRecord[];
}): SafetyCheckResult {
  const catalog = input.catalog ?? DRUG_CATALOG;
  const resolved = resolveDrugs(input.medications, catalog);
  const genericNames = resolved.map((d) => d.genericName);

  const drugDrugInteractions = detectDrugDrugInteractions(
    resolved,
    input.interactionData ?? INTERACTION_DATA
  );

  const allergyInteractions: AllergyInteraction[] = [];
  for (const genericName of genericNames) {
    allergyInteractions.push(
      ...detectAllergyInteractions(genericName, input.allergies ?? [], catalog)
    );
  }

  const foodInteractions: FoodInteraction[] = [];
  if (input.includeFood) {
    for (const genericName of genericNames) {
      foodInteractions.push(
        ...detectFoodInteractions(genericName, input.foodData ?? FOOD_INTERACTION_DATA)
      );
    }
  }

  const severity = classifySeverity([
    ...drugDrugInteractions,
    ...allergyInteractions,
    ...foodInteractions,
  ]);

  return {
    severity,
    drugDrugInteractions,
    allergyInteractions,
    foodInteractions,
    summary: buildSafetySummary(
      severity,
      drugDrugInteractions.length,
      allergyInteractions.length,
      foodInteractions.length
    ),
  };
}
