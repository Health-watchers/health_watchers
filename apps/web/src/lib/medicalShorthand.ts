/**
 * Medical shorthand abbreviation expansions.
 * Used for autocomplete suggestions in the SOAP notes editor.
 */
export const MEDICAL_SHORTHANDS: Record<string, string> = {
  SOB: 'Shortness of breath',
  'c/o': 'complains of',
  'h/o': 'history of',
  Hx: 'History',
  hx: 'History',
  Dx: 'Diagnosis',
  dx: 'Diagnosis',
  Rx: 'Prescription',
  rx: 'Prescription',
  PRN: 'as needed',
  prn: 'as needed',
  BID: 'twice daily',
  bid: 'twice daily',
  TID: 'three times daily',
  tid: 'three times daily',
  QID: 'four times daily',
  qid: 'four times daily',
  QD: 'once daily',
  qd: 'once daily',
  HTN: 'Hypertension',
  DM: 'Diabetes mellitus',
  DM2: 'Type 2 diabetes mellitus',
  CAD: 'Coronary artery disease',
  CHF: 'Congestive heart failure',
  COPD: 'Chronic obstructive pulmonary disease',
  URI: 'Upper respiratory infection',
  UTI: 'Urinary tract infection',
  'N/V': 'Nausea and vomiting',
  'N/V/D': 'Nausea, vomiting, and diarrhea',
  BP: 'Blood pressure',
  HR: 'Heart rate',
  RR: 'Respiratory rate',
  Temp: 'Temperature',
  SpO2: 'Oxygen saturation',
  BMI: 'Body mass index',
  WNL: 'Within normal limits',
  NAD: 'No acute distress',
  'A&O': 'Alert and oriented',
  CC: 'Chief complaint',
  HPI: 'History of present illness',
  PMH: 'Past medical history',
  FH: 'Family history',
  SH: 'Social history',
  ROS: 'Review of systems',
  PE: 'Physical examination',
  Sx: 'Symptoms',
  Tx: 'Treatment',
  'f/u': 'follow-up',
  'w/': 'with',
  'w/o': 'without',
  'y/o': 'year old',
  yo: 'year old',
  pt: 'patient',
  Pt: 'Patient',
};

/**
 * Returns matching shorthand suggestions for a given word prefix.
 */
export function getSuggestions(word: string): Array<{ abbr: string; expansion: string }> {
  if (!word || word.length < 2) return [];
  return Object.entries(MEDICAL_SHORTHANDS)
    .filter(([abbr]) => abbr.toLowerCase().startsWith(word.toLowerCase()))
    .slice(0, 6)
    .map(([abbr, expansion]) => ({ abbr, expansion }));
}

/**
 * Expands a single abbreviation if it exists in the map.
 */
export function expandShorthand(word: string): string | null {
  return MEDICAL_SHORTHANDS[word] ?? null;
}

/**
 * Expands all known shorthand abbreviations in a block of free text.
 * Whole-word matching is used so that substrings like "BP" inside "BPD" are not replaced.
 * Used by the voice dictation pipeline to auto-correct dictated shorthand.
 */
export function expandShorthandInText(text: string): string {
  if (!text) return text;
  // Sort by length descending so multi-char abbreviations (e.g. "N/V/D") match before single chars
  const abbreviations = Object.keys(MEDICAL_SHORTHANDS).sort((a, b) => b.length - a.length);
  let result = text;
  for (const abbr of abbreviations) {
    // Escape regex special characters in the abbreviation
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match whole word, case-sensitive for abbreviations that have specific casing
    const re = new RegExp(`\\b${escaped}\\b`, 'g');
    result = result.replace(re, () => MEDICAL_SHORTHANDS[abbr]!);
  }
  return result;
}
