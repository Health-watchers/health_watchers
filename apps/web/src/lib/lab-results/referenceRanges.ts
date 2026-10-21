import type { AnalyteDefinition, AnalyteKey } from './types';

/**
 * Reference intervals used for flagging. In production these are clinic
 * configurable; this table is the fallback used when no clinic range is stored.
 */
export const ANALYTE_DEFINITIONS: AnalyteDefinition[] = [
  {
    key: 'sodium',
    name: 'Sodium',
    shortName: 'Na',
    unit: 'mmol/L',
    panel: 'Electrolytes',
    low: 135,
    high: 145,
    criticalLow: 120,
    criticalHigh: 160,
    decimals: 0,
    interpretation:
      'Sodium reflects fluid balance. Interpret alongside the patient’s volume status and medication list.',
    highMeaning: 'Raised sodium usually indicates dehydration or water loss.',
    lowMeaning: 'Low sodium can reflect over-hydration, diuretics or SIADH.',
  },
  {
    key: 'potassium',
    name: 'Potassium',
    shortName: 'K',
    unit: 'mmol/L',
    panel: 'Electrolytes',
    low: 3.5,
    high: 5.1,
    criticalLow: 2.5,
    criticalHigh: 6.5,
    decimals: 1,
    interpretation:
      'Potassium affects cardiac conduction. Values outside the critical limits need urgent review, especially with ACE inhibitors.',
    highMeaning: 'Hyperkalaemia is commonly caused by renal impairment or potassium-sparing drugs.',
    lowMeaning: 'Hypokalaemia is commonly caused by diuretics or gastrointestinal losses.',
  },
  {
    key: 'creatinine',
    name: 'Creatinine',
    shortName: 'Creat',
    unit: 'µmol/L',
    panel: 'Renal function',
    low: 59,
    high: 104,
    criticalLow: null,
    criticalHigh: 500,
    decimals: 0,
    interpretation:
      'Creatinine rises as glomerular filtration falls. Always interpret with eGFR, age and muscle mass.',
    highMeaning: 'A rise suggests reduced renal clearance — review nephrotoxic medication.',
    lowMeaning: 'Low creatinine is often benign (low muscle mass).',
  },
  {
    key: 'egfr',
    name: 'Estimated GFR',
    shortName: 'eGFR',
    unit: 'mL/min/1.73m²',
    panel: 'Renal function',
    low: 90,
    high: 120,
    criticalLow: 15,
    criticalHigh: null,
    decimals: 0,
    interpretation:
      'eGFR estimates kidney function. Below 60 for three months meets the definition of chronic kidney disease.',
    highMeaning: 'High eGFR is generally not clinically significant.',
    lowMeaning: 'Falling eGFR requires renal review and medication dose adjustment.',
  },
  {
    key: 'fasting_glucose',
    name: 'Fasting glucose',
    shortName: 'Glucose',
    unit: 'mmol/L',
    panel: 'Diabetes monitoring',
    low: 3.9,
    high: 5.5,
    criticalLow: 2.5,
    criticalHigh: 20,
    decimals: 1,
    interpretation:
      'Diagnostic thresholds: 5.6–6.9 mmol/L indicates impaired fasting glucose; ≥7.0 mmol/L supports diabetes.',
    highMeaning: 'Raised fasting glucose suggests inadequate glycaemic control.',
    lowMeaning: 'Hypoglycaemia may be caused by excess insulin or a missed meal.',
  },
  {
    key: 'hba1c',
    name: 'HbA1c',
    shortName: 'HbA1c',
    unit: '%',
    panel: 'Diabetes monitoring',
    low: 4,
    high: 5.6,
    criticalLow: null,
    criticalHigh: null,
    decimals: 1,
    interpretation:
      'Reflects average glucose over 8–12 weeks. Most adults with diabetes target below 7.0%.',
    highMeaning: 'Raised HbA1c reflects sustained hyperglycaemia and complication risk.',
    lowMeaning: 'Low HbA1c may reflect anaemia or recent hypoglycaemia.',
  },
  {
    key: 'haemoglobin',
    name: 'Haemoglobin',
    shortName: 'Hb',
    unit: 'g/dL',
    panel: 'Full blood count',
    low: 12,
    high: 16,
    criticalLow: 7,
    criticalHigh: 20,
    decimals: 1,
    interpretation:
      'Haemoglobin defines anaemia. Confirm with the red-cell indices before classifying the cause.',
    highMeaning: 'Raised haemoglobin suggests polycythaemia or chronic hypoxia.',
    lowMeaning: 'Low haemoglobin indicates anaemia — consider iron, B12 and bleeding.',
  },
  {
    key: 'wbc',
    name: 'White cell count',
    shortName: 'WBC',
    unit: '×10⁹/L',
    panel: 'Full blood count',
    low: 4,
    high: 11,
    criticalLow: 1,
    criticalHigh: 30,
    decimals: 1,
    interpretation:
      'The white cell count supports the diagnosis of infection or marrow suppression. Compare with the differential.',
    highMeaning: 'Leucocytosis commonly accompanies infection or inflammation.',
    lowMeaning: 'Leucopenia raises neutropenic sepsis risk and needs urgent review.',
  },
  {
    key: 'platelets',
    name: 'Platelets',
    shortName: 'PLT',
    unit: '×10⁹/L',
    panel: 'Full blood count',
    low: 150,
    high: 400,
    criticalLow: 50,
    criticalHigh: 1000,
    decimals: 0,
    interpretation:
      'Platelets assess bleeding and clotting risk, and are essential before procedures.',
    highMeaning: 'Thrombocytosis may be reactive or primary.',
    lowMeaning: 'Thrombocytopenia increases bleeding risk — check for sepsis or drug causes.',
  },
  {
    key: 'alt',
    name: 'Alanine aminotransferase',
    shortName: 'ALT',
    unit: 'U/L',
    panel: 'Liver function',
    low: 10,
    high: 40,
    criticalLow: null,
    criticalHigh: 200,
    decimals: 0,
    interpretation:
      'ALT is the most specific marker of hepatocyte injury. Interpret with AST, bilirubin and the medication list.',
    highMeaning: 'Raised ALT suggests hepatocellular injury — review hepatotoxic drugs.',
    lowMeaning: 'Low ALT is generally not clinically significant.',
  },
  {
    key: 'ast',
    name: 'Aspartate aminotransferase',
    shortName: 'AST',
    unit: 'U/L',
    panel: 'Liver function',
    low: 10,
    high: 40,
    criticalLow: null,
    criticalHigh: 200,
    decimals: 0,
    interpretation:
      'AST is less specific than ALT as it also derives from muscle. Useful with ALT for pattern recognition.',
    highMeaning: 'Raised AST may reflect hepatic, cardiac or skeletal muscle injury.',
    lowMeaning: 'Low AST is generally not clinically significant.',
  },
  {
    key: 'total_cholesterol',
    name: 'Total cholesterol',
    shortName: 'TC',
    unit: 'mmol/L',
    panel: 'Lipid profile',
    low: 0,
    high: 5,
    criticalLow: null,
    criticalHigh: null,
    decimals: 1,
    interpretation:
      'Assess total cholesterol with LDL, HDL and triglycerides to estimate cardiovascular risk.',
    highMeaning: 'Raised cholesterol increases cardiovascular risk and may need statin therapy.',
    lowMeaning: 'Low cholesterol is rarely clinically significant.',
  },
  {
    key: 'ldl',
    name: 'LDL cholesterol',
    shortName: 'LDL',
    unit: 'mmol/L',
    panel: 'Lipid profile',
    low: 0,
    high: 3,
    criticalLow: null,
    criticalHigh: null,
    decimals: 1,
    interpretation:
      'LDL is the primary lipid target. Treatment targets fall below 1.8 mmol/L for high-risk patients.',
    highMeaning: 'Raised LDL is the main modifiable driver of atherosclerotic risk.',
    lowMeaning: 'Low LDL is usually desirable.',
  },
  {
    key: 'hdl',
    name: 'HDL cholesterol',
    shortName: 'HDL',
    unit: 'mmol/L',
    panel: 'Lipid profile',
    low: 1,
    high: 2,
    criticalLow: null,
    criticalHigh: null,
    decimals: 1,
    interpretation: 'HDL is protective; low values increase cardiovascular risk.',
    highMeaning: 'High HDL is generally protective.',
    lowMeaning: 'Low HDL is an independent cardiovascular risk factor.',
  },
  {
    key: 'triglycerides',
    name: 'Triglycerides',
    shortName: 'TG',
    unit: 'mmol/L',
    panel: 'Lipid profile',
    low: 0,
    high: 1.7,
    criticalLow: null,
    criticalHigh: 10,
    decimals: 1,
    interpretation:
      'Triglycerides above 10 mmol/L carry a risk of pancreatitis and require urgent management.',
    highMeaning: 'Raised triglycerides accompany insulin resistance and alcohol use.',
    lowMeaning: 'Low triglycerides are usually desirable.',
  },
  {
    key: 'tsh',
    name: 'Thyroid stimulating hormone',
    shortName: 'TSH',
    unit: 'mIU/L',
    panel: 'Thyroid',
    low: 0.4,
    high: 4,
    criticalLow: null,
    criticalHigh: null,
    decimals: 2,
    interpretation:
      'TSH is the primary thyroid screening test. A raised TSH indicates hypothyroidism, a suppressed TSH hyperthyroidism.',
    highMeaning: 'Raised TSH suggests an underactive thyroid.',
    lowMeaning: 'Suppressed TSH suggests an overactive thyroid.',
  },
  {
    key: 'crp',
    name: 'C-reactive protein',
    shortName: 'CRP',
    unit: 'mg/L',
    panel: 'Inflammation',
    low: 0,
    high: 5,
    criticalLow: null,
    criticalHigh: 100,
    decimals: 0,
    interpretation:
      'CRP is a non-specific acute-phase marker. Interpret with the clinical picture rather than in isolation.',
    highMeaning: 'Raised CRP indicates active inflammation or infection.',
    lowMeaning: 'A normal CRP does not exclude serious illness.',
  },
  {
    key: 'inr',
    name: 'International normalised ratio',
    shortName: 'INR',
    unit: '',
    panel: 'Coagulation',
    low: 0.8,
    high: 1.2,
    criticalLow: null,
    criticalHigh: 5,
    decimals: 1,
    interpretation:
      'The INR monitors warfarin therapy. Most indications target 2.0–3.0; above 5.0 carries a high bleeding risk.',
    highMeaning: 'A raised INR indicates increased bleeding risk — hold anticoagulation if critical.',
    lowMeaning: 'A low INR in a treated patient indicates under-anticoagulation.',
  },
];

type AnalyteDefinitionIndex = Map<AnalyteKey, AnalyteDefinition>;

const DEFINITION_PAIRS: [AnalyteKey, AnalyteDefinition][] = ANALYTE_DEFINITIONS.map(
  (definition) => [definition.key, definition]
);

const DEFINITION_INDEX: AnalyteDefinitionIndex = new Map(DEFINITION_PAIRS);

/** Reference definition for an analyte. Throws if the table has no entry. */
export function getAnalyteDefinition(key: AnalyteKey): AnalyteDefinition {
  const definition = DEFINITION_INDEX.get(key);
  if (!definition) throw new Error(`No reference range configured for analyte ${key}`);
  return definition;
}

export function getAnalyteDefinitionOrNull(key: AnalyteKey): AnalyteDefinition | null {
  return DEFINITION_INDEX.get(key) ?? null;
}

/** Human readable reference interval, e.g. `135–145 mmol/L`. */
export function formatReferenceRange(definition: AnalyteDefinition): string {
  const unit = definition.unit ? ` ${definition.unit}` : '';
  return `${definition.low}–${definition.high}${unit}`;
}

/** Formats a measurement with the analyte's precision, e.g. `4.8`. */
export function formatAnalyteValue(definition: AnalyteDefinition, value: number): string {
  return value.toFixed(definition.decimals);
}

export const ANALYTE_OPTIONS: { value: AnalyteKey; label: string }[] =
  ANALYTE_DEFINITIONS.map((definition) => ({
    value: definition.key,
    label: `${definition.name} (${definition.shortName})`,
  }));

export const PANEL_OPTIONS: { value: string; label: string }[] = Array.from(
  new Set(ANALYTE_DEFINITIONS.map((definition) => definition.panel))
).map((panel) => ({ value: panel, label: panel }));

