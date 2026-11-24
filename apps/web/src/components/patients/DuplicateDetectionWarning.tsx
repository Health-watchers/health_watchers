'use client';

import Link from 'next/link';

interface DuplicatePatient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  matchScore: number;
}

interface DuplicateDetectionWarningProps {
  patients: DuplicatePatient[];
}

export function DuplicateDetectionWarning({ patients }: DuplicateDetectionWarningProps) {
  if (patients.length < 2) return null;

  const duplicatePairs = findDuplicatePairs(patients);
  if (duplicatePairs.length === 0) return null;

  return (
    <div className="border-warning-200 bg-warning-50 dark:border-warning-900 dark:bg-warning-900/30 rounded-lg border p-4">
      <div className="flex gap-3">
        <span className="text-lg">⚠️</span>
        <div>
          <h3 className="text-warning-900 dark:text-warning-200 font-semibold">
            Potential Duplicate Patients
          </h3>
          <p className="text-warning-800 dark:text-warning-300 mt-1 text-sm">
            {duplicatePairs.length} potential duplicate record
            {duplicatePairs.length !== 1 ? 's' : ''} detected. Review and merge if needed.
          </p>
          <div className="mt-3 space-y-2">
            {duplicatePairs.slice(0, 3).map((pair, i) => (
              <div key={i} className="text-warning-700 dark:text-warning-400 text-xs">
                {pair[0].firstName} {pair[0].lastName} ({pair[0].dateOfBirth}) ↔ {pair[1].firstName}{' '}
                {pair[1].lastName} ({pair[1].dateOfBirth}) —{' '}
                <span className="font-medium">{Math.round(pair[0].matchScore * 100)}% match</span>
              </div>
            ))}
          </div>
          {duplicatePairs.length > 3 && (
            <Link
              href="/patients/duplicates"
              className="text-warning-700 dark:text-warning-300 mt-2 inline-block text-xs font-medium hover:underline"
            >
              View all {duplicatePairs.length} duplicates →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function findDuplicatePairs(patients: DuplicatePatient[]) {
  const pairs: [DuplicatePatient, DuplicatePatient][] = [];
  for (let i = 0; i < patients.length; i++) {
    for (let j = i + 1; j < patients.length; j++) {
      const score = calculateSimilarityScore(patients[i], patients[j]);
      if (score > 0.7) {
        pairs.push([patients[i], patients[j]]);
      }
    }
  }
  return pairs.sort((a, b) => b[0].matchScore - a[0].matchScore);
}

function calculateSimilarityScore(p1: DuplicatePatient, p2: DuplicatePatient): number {
  let score = 0;
  const maxScore = 3;

  const name1 = `${p1.firstName} ${p1.lastName}`.toLowerCase();
  const name2 = `${p2.firstName} ${p2.lastName}`.toLowerCase();

  if (levenshteinDistance(name1, name2) < 3) score += 1;
  if (p1.dateOfBirth === p2.dateOfBirth) score += 1;
  if (name1.includes(p2.lastName.toLowerCase()) || name2.includes(p1.lastName.toLowerCase()))
    score += 1;

  return score / maxScore;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}
