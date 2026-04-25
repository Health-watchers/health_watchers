import { PatientModel } from './models/patient.model';
import { Types } from 'mongoose';

// Levenshtein distance for fuzzy matching
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

// Soundex algorithm for phonetic matching
function soundex(str: string): string {
  const code = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!code) return '0000';
  
  const firstLetter = code[0];
  const mapping: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };
  
  let soundexCode = firstLetter;
  for (let i = 1; i < code.length; i++) {
    const digit = mapping[code[i]] || '0';
    if (digit !== '0' && digit !== soundexCode[soundexCode.length - 1]) {
      soundexCode += digit;
    }
  }
  
  return (soundexCode + '0000').substring(0, 4);
}

export interface DuplicateMatch {
  patient: any;
  similarityScore: number;
  matchType: 'exact' | 'fuzzy' | 'phonetic';
}

export class DuplicateDetectionService {
  /**
   * Check for potential duplicates
   */
  static async checkDuplicates(
    firstName: string,
    lastName: string,
    dateOfBirth: string,
    clinicId: string,
    threshold: number = 3
  ): Promise<DuplicateMatch[]> {
    const matches: DuplicateMatch[] = [];
    
    // Exact match
    const exactMatches = await PatientModel.find({
      firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
      lastName: { $regex: new RegExp(`^${lastName}$`, 'i') },
      dateOfBirth,
      clinicId: new Types.ObjectId(clinicId),
      isActive: true,
      isDuplicate: { $ne: true },
    }).lean();
    
    for (const match of exactMatches) {
      matches.push({
        patient: match,
        similarityScore: 100,
        matchType: 'exact',
      });
    }
    
    // Fuzzy match (same DOB, similar name)
    const sameDOBPatients = await PatientModel.find({
      dateOfBirth,
      clinicId: new Types.ObjectId(clinicId),
      isActive: true,
      isDuplicate: { $ne: true },
    }).lean();
    
    for (const patient of sameDOBPatients) {
      const firstNameDist = levenshteinDistance(
        firstName.toLowerCase(),
        patient.firstName.toLowerCase()
      );
      const lastNameDist = levenshteinDistance(
        lastName.toLowerCase(),
        patient.lastName.toLowerCase()
      );
      
      if (firstNameDist <= threshold && lastNameDist <= threshold) {
        const alreadyMatched = matches.some(m => 
          m.patient._id.toString() === patient._id.toString()
        );
        
        if (!alreadyMatched) {
          const score = 100 - ((firstNameDist + lastNameDist) * 10);
          matches.push({
            patient,
            similarityScore: Math.max(score, 0),
            matchType: 'fuzzy',
          });
        }
      }
    }
    
    // Phonetic match (soundex)
    const firstNameSoundex = soundex(firstName);
    const lastNameSoundex = soundex(lastName);
    
    const allPatients = await PatientModel.find({
      dateOfBirth,
      clinicId: new Types.ObjectId(clinicId),
      isActive: true,
      isDuplicate: { $ne: true },
    }).lean();
    
    for (const patient of allPatients) {
      const patientFirstSoundex = soundex(patient.firstName);
      const patientLastSoundex = soundex(patient.lastName);
      
      if (
        patientFirstSoundex === firstNameSoundex &&
        patientLastSoundex === lastNameSoundex
      ) {
        const alreadyMatched = matches.some(m => 
          m.patient._id.toString() === patient._id.toString()
        );
        
        if (!alreadyMatched) {
          matches.push({
            patient,
            similarityScore: 75,
            matchType: 'phonetic',
          });
        }
      }
    }
    
    // Sort by similarity score (highest first)
    return matches.sort((a, b) => b.similarityScore - a.similarityScore);
  }

  /**
   * Mark patient as potential duplicate
   */
  static async markPotentialDuplicate(
    patientId: string,
    duplicateIds: string[]
  ): Promise<void> {
    await PatientModel.findByIdAndUpdate(patientId, {
      $addToSet: { potentialDuplicates: { $each: duplicateIds.map(id => new Types.ObjectId(id)) } },
    });
  }
}
