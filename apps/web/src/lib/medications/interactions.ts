import { DRUG_INTERACTIONS } from './catalog';
import type {
  DrugInteraction,
  InteractionCheck,
  InteractionSeverity,
  MedicationStatus,
} from './types';

/** Higher rank = clinically more severe. */
const SEVERITY_RANK: Record<InteractionSeverity, number> = {
  contraindicated: 4,
  major: 3,
  moderate: 2,
  minor: 1,
};

export function severityRank(severity: InteractionSeverity): number {
  return SEVERITY_RANK[severity];
}

export interface InteractionCandidate {
  drugId: string;
  drugName: string;
}

/** Minimal shape needed from an existing prescription to check interactions. */
export interface InteractionSubject {
  id: string;
  drugId: string;
  drugName: string;
  status: MedicationStatus;
}

function pairMatches(interaction: DrugInteraction, drugIdA: string, drugIdB: string): boolean {
  const [first, second] = interaction.drugIds;
  return (first === drugIdA && second === drugIdB) || (first === drugIdB && second === drugIdA);
}

/**
 * Real-time interaction check for a candidate drug against the patient's
 * current active regimen. Results are returned most-severe-first.
 *
 * This is a pure function so the UI can call it on every keystroke/selection
 * without waiting for a network round-trip.
 */
export function checkInteractions(
  candidate: InteractionCandidate,
  activeMedications: readonly InteractionSubject[],
  interactions: readonly DrugInteraction[] = DRUG_INTERACTIONS
): InteractionCheck[] {
  const checks: InteractionCheck[] = [];

  for (const medication of activeMedications) {
    if (medication.status !== 'active') continue;
    if (medication.drugId === candidate.drugId) continue;

    const match = interactions.find((interaction) =>
      pairMatches(interaction, medication.drugId, candidate.drugId)
    );
    if (!match) continue;

    checks.push({
      interactionId: match.id,
      severity: match.severity,
      description: match.description,
      management: match.management,
      medicationId: medication.id,
      medicationName: medication.drugName,
      candidateName: candidate.drugName,
    });
  }

  return sortInteractions(checks);
}

/** Interaction review for an entire regimen (every unordered pair). */
export function checkRegimenInteractions(
  medications: readonly InteractionSubject[],
  interactions: readonly DrugInteraction[] = DRUG_INTERACTIONS
): InteractionCheck[] {
  const checks: InteractionCheck[] = [];
  const active = medications.filter((medication) => medication.status === 'active');

  for (let i = 0; i < active.length; i += 1) {
    const left = active[i];
    if (!left) continue;
    for (let j = i + 1; j < active.length; j += 1) {
      const right = active[j];
      if (!right) continue;
      const match = interactions.find((interaction) =>
        pairMatches(interaction, left.drugId, right.drugId)
      );
      if (!match) continue;
      checks.push({
        interactionId: match.id,
        severity: match.severity,
        description: match.description,
        management: match.management,
        medicationId: right.id,
        medicationName: right.drugName,
        candidateName: left.drugName,
      });
    }
  }

  return sortInteractions(checks);
}

export function sortInteractions(checks: readonly InteractionCheck[]): InteractionCheck[] {
  return [...checks].sort((a, b) => {
    const bySeverity = severityRank(b.severity) - severityRank(a.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.candidateName.localeCompare(b.candidateName);
  });
}

/** Highest severity present, or `null` when there are no findings. */
export function highestSeverity(checks: readonly InteractionCheck[]): InteractionSeverity | null {
  let highest: InteractionSeverity | null = null;
  for (const check of checks) {
    if (highest === null || severityRank(check.severity) > severityRank(highest)) {
      highest = check.severity;
    }
  }
  return highest;
}

export function countBySeverity(
  checks: readonly InteractionCheck[]
): Record<InteractionSeverity, number> {
  const counts: Record<InteractionSeverity, number> = {
    contraindicated: 0,
    major: 0,
    moderate: 0,
    minor: 0,
  };
  for (const check of checks) counts[check.severity] += 1;
  return counts;
}

/** True when the regimen must not proceed without an explicit override. */
export function requiresOverride(checks: readonly InteractionCheck[]): boolean {
  const severity = highestSeverity(checks);
  return severity === 'contraindicated' || severity === 'major';
}
