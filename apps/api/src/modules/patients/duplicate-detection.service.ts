import { PatientModel } from './models/patient.model';
import { Types } from 'mongoose';

// ── Levenshtein distance ──────────────────────────────────────────────────────
function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]);
    }
  }
  return dp[m][n];
}

// ── Jaro-Winkler similarity (0–1) ─────────────────────────────────────────────
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0, transpositions = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  // Winkler prefix bonus (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++; else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

// ── Soundex ───────────────────────────────────────────────────────────────────
export function soundex(str: string): string {
  const code = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!code) return '0000';
  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3', L: '4', M: '5', N: '5', R: '6',
  };
  let result = code[0];
  for (let i = 1; i < code.length; i++) {
    const d = map[code[i]] ?? '0';
    if (d !== '0' && d !== result[result.length - 1]) result += d;
  }
  return (result + '0000').slice(0, 4);
}

// ── Phone normalization ───────────────────────────────────────────────────────
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// ── DOB ±1 day candidates ─────────────────────────────────────────────────────
function dobCandidates(dob: string): string[] {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return [dob];
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  const prev = new Date(d); prev.setDate(d.getDate() - 1);
  const next = new Date(d); next.setDate(d.getDate() + 1);
  return [fmt(prev), dob, fmt(next)];
}

// ── Confidence score ──────────────────────────────────────────────────────────
function computeConfidence(
  firstSim: number,
  lastSim: number,
  dobExact: boolean,
  phoneMatch: boolean | null
): number {
  // Weighted: name 60%, DOB 30%, phone 10%
  const nameSim = (firstSim * 0.4 + lastSim * 0.6);
  let score = nameSim * 60 + (dobExact ? 30 : 20);
  if (phoneMatch === true) score += 10;
  else if (phoneMatch === false) score -= 10;
  return Math.round(Math.min(100, Math.max(0, score)));
}

export interface DuplicateMatch {
  patient: any;
  similarityScore: number;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'phonetic';
  matchReasons: string[];
}

export interface DuplicatePair {
  patientA: any;
  patientB: any;
  confidence: number;
  matchReasons: string[];
}

export class DuplicateDetectionService {
  /**
   * Check for potential duplicates of a given patient (used at registration time).
   */
  static async checkDuplicates(
    firstName: string,
    lastName: string,
    dateOfBirth: string,
    clinicId: string,
    _threshold: number = 3
  ): Promise<DuplicateMatch[]> {
    const fn = firstName.toLowerCase();
    const ln = lastName.toLowerCase();
    const fnSdx = soundex(firstName);
    const lnSdx = soundex(lastName);
    const dobRange = dobCandidates(dateOfBirth);

    // Fetch candidates: same DOB ±1 day in this clinic
    const candidates = await PatientModel.find({
      dateOfBirth: { $in: dobRange },
      clinicId: new Types.ObjectId(clinicId),
      isActive: true,
      isDuplicate: { $ne: true },
    }).lean();

    const results: DuplicateMatch[] = [];

    for (const p of candidates) {
      const pfn = (p.firstName as string).toLowerCase();
      const pln = (p.lastName as string).toLowerCase();

      const firstSim = jaroWinkler(fn, pfn);
      const lastSim = jaroWinkler(ln, pln);
      const dobExact = p.dateOfBirth === dateOfBirth;

      // Phone comparison (if both present)
      let phoneMatch: boolean | null = null;
      if (p.contactNumber && firstName) {
        // We don't have the incoming phone here — skip phone scoring at check time
        phoneMatch = null;
      }

      const reasons: string[] = [];
      let matchType: DuplicateMatch['matchType'] = 'fuzzy';

      if (firstSim === 1 && lastSim === 1 && dobExact) {
        matchType = 'exact';
        reasons.push('exact name and DOB match');
      } else {
        if (firstSim >= 0.85) reasons.push(`first name similarity ${(firstSim * 100).toFixed(0)}%`);
        if (lastSim >= 0.85) reasons.push(`last name similarity ${(lastSim * 100).toFixed(0)}%`);
        if (soundex(p.firstName) === fnSdx && soundex(p.lastName) === lnSdx) {
          matchType = 'phonetic';
          reasons.push('phonetic name match');
        }
        if (!dobExact) reasons.push('DOB within ±1 day');
        else reasons.push('exact DOB match');
      }

      // Only include if names are sufficiently similar
      if (firstSim < 0.7 && lastSim < 0.7) continue;

      const confidence = computeConfidence(firstSim, lastSim, dobExact, phoneMatch);
      if (confidence < 40) continue;

      results.push({
        patient: p,
        similarityScore: Math.round((firstSim * 0.4 + lastSim * 0.6) * 100),
        confidence,
        matchType,
        matchReasons: reasons,
      });
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Scan all active patients in a clinic and return ranked duplicate pairs.
   * Used by GET /api/v1/patients/potential-duplicates.
   */
  static async findPotentialDuplicates(
    clinicId: string,
    minConfidence: number = 60
  ): Promise<DuplicatePair[]> {
    const patients = await PatientModel.find({
      clinicId: new Types.ObjectId(clinicId),
      isActive: true,
      isDuplicate: { $ne: true },
    })
      .select('firstName lastName dateOfBirth contactNumber _id systemId')
      .lean();

    const pairs: DuplicatePair[] = [];

    for (let i = 0; i < patients.length; i++) {
      for (let j = i + 1; j < patients.length; j++) {
        const a = patients[i];
        const b = patients[j];

        const dobA = typeof a.dateOfBirth === 'string'
          ? a.dateOfBirth
          : (a.dateOfBirth as Date).toISOString().slice(0, 10);
        const dobB = typeof b.dateOfBirth === 'string'
          ? b.dateOfBirth
          : (b.dateOfBirth as Date).toISOString().slice(0, 10);

        const dobExact = dobA === dobB;
        const dobClose = !dobExact && dobCandidates(dobA).includes(dobB);
        if (!dobExact && !dobClose) continue; // skip if DOB not within ±1 day

        const firstSim = jaroWinkler(
          (a.firstName as string).toLowerCase(),
          (b.firstName as string).toLowerCase()
        );
        const lastSim = jaroWinkler(
          (a.lastName as string).toLowerCase(),
          (b.lastName as string).toLowerCase()
        );

        if (firstSim < 0.7 && lastSim < 0.7) continue;

        // Phone comparison
        let phoneMatch: boolean | null = null;
        if (a.contactNumber && b.contactNumber) {
          phoneMatch = normalizePhone(a.contactNumber as string) === normalizePhone(b.contactNumber as string);
        }

        const confidence = computeConfidence(firstSim, lastSim, dobExact, phoneMatch);
        if (confidence < minConfidence) continue;

        const reasons: string[] = [];
        if (firstSim >= 0.85) reasons.push(`first name ${(firstSim * 100).toFixed(0)}% similar`);
        if (lastSim >= 0.85) reasons.push(`last name ${(lastSim * 100).toFixed(0)}% similar`);
        if (soundex(a.firstName as string) === soundex(b.firstName as string) &&
            soundex(a.lastName as string) === soundex(b.lastName as string)) {
          reasons.push('phonetic name match');
        }
        if (dobExact) reasons.push('exact DOB match');
        else reasons.push('DOB within ±1 day');
        if (phoneMatch === true) reasons.push('matching phone number');

        pairs.push({ patientA: a, patientB: b, confidence, matchReasons: reasons });
      }
    }

    return pairs.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Mark patient as potential duplicate.
   */
  static async markPotentialDuplicate(
    patientId: string,
    duplicateIds: string[]
  ): Promise<void> {
    await PatientModel.findByIdAndUpdate(patientId, {
      $addToSet: { potentialDuplicates: { $each: duplicateIds.map((id) => new Types.ObjectId(id)) } },
    });
  }
}
