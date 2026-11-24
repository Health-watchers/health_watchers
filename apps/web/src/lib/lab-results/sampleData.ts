import type {
  AnalyteKey,
  LabPanel,
  LabResultSet,
  PatientSummary,
  ResultSetStatus,
} from './types';

/**
 * Demo laboratory history. The page prefers `/api/v1/lab-results` and falls back
 * to this dataset (clearly labelled in the UI) when the API is unavailable.
 */

export const SAMPLE_LAB_PATIENTS: PatientSummary[] = [
  { id: 'p-1001', name: 'Ada Okafor', mrn: 'MRN-1001', dateOfBirth: '1968-04-12' },
  { id: 'p-1002', name: 'Chinedu Balogun', mrn: 'MRN-1002', dateOfBirth: '1979-11-02' },
];

interface SetSeed {
  id: string;
  panel: LabPanel;
  collectedOn: string;
  orderedBy: string;
  results: [AnalyteKey, number][];
  patientId?: string;
  status?: ResultSetStatus;
  notes?: string;
}

function createSet(seed: SetSeed): LabResultSet {
  return {
    id: seed.id,
    patientId: seed.patientId ?? 'p-1001',
    panel: seed.panel,
    collectedAt: `${seed.collectedOn}T07:45:00.000Z`,
    reportedAt: `${seed.collectedOn}T16:20:00.000Z`,
    orderedBy: seed.orderedBy,
    status: seed.status ?? 'final',
    results: seed.results.map(([analyte, value]) => ({ analyte, value })),
    notes: seed.notes ?? '',
  };
}

const DR_OKAFOR = 'Dr. Ngozi Eze';
const DR_BALOGUN = 'Dr. Samuel Adeyemi';

export const SAMPLE_LAB_RESULT_SETS: LabResultSet[] = [
  createSet({
    id: 'lab-2001',
    panel: 'Diabetes monitoring',
    collectedOn: '2025-11-04',
    orderedBy: DR_OKAFOR,
    results: [
      ['fasting_glucose', 6.4],
      ['hba1c', 7.2],
    ],
    notes: 'Annual diabetes review.',
  }),
  createSet({
    id: 'lab-2002',
    panel: 'Lipid profile',
    collectedOn: '2025-11-04',
    orderedBy: DR_OKAFOR,
    results: [
      ['total_cholesterol', 5.8],
      ['ldl', 3.9],
      ['hdl', 1.2],
      ['triglycerides', 1.9],
    ],
    notes: 'Fasting sample.',
  }),
  createSet({
    id: 'lab-2003',
    panel: 'Renal function',
    collectedOn: '2026-02-10',
    orderedBy: DR_OKAFOR,
    results: [
      ['creatinine', 98],
      ['egfr', 78],
    ],
    notes: 'Baseline before ACE inhibitor titration.',
  }),
  createSet({
    id: 'lab-2004',
    panel: 'Electrolytes',
    collectedOn: '2026-02-10',
    orderedBy: DR_OKAFOR,
    results: [
      ['sodium', 138],
      ['potassium', 5.6],
    ],
    notes: 'Potassium above range — repeat in two weeks.',
  }),
  createSet({
    id: 'lab-2005',
    panel: 'Full blood count',
    collectedOn: '2026-05-18',
    orderedBy: DR_OKAFOR,
    results: [
      ['haemoglobin', 11.2],
      ['wbc', 11.8],
      ['platelets', 410],
    ],
    notes: 'Mild anaemia with raised white cell count.',
  }),
  createSet({
    id: 'lab-2006',
    panel: 'Liver function',
    collectedOn: '2026-05-18',
    orderedBy: DR_OKAFOR,
    results: [
      ['alt', 62],
      ['ast', 48],
    ],
  }),
  createSet({
    id: 'lab-2007',
    panel: 'Diabetes monitoring',
    collectedOn: '2026-08-20',
    orderedBy: DR_OKAFOR,
    results: [
      ['fasting_glucose', 8.6],
      ['hba1c', 8.4],
    ],
    notes: 'Glycaemic control has deteriorated since the last review.',
  }),
  createSet({
    id: 'lab-2008',
    panel: 'Lipid profile',
    collectedOn: '2026-08-20',
    orderedBy: DR_OKAFOR,
    results: [
      ['total_cholesterol', 4.9],
      ['ldl', 2.8],
      ['hdl', 1.4],
      ['triglycerides', 1.5],
    ],
    notes: 'Improving on statin therapy.',
  }),
  createSet({
    id: 'lab-2009',
    panel: 'Renal function',
    collectedOn: '2026-08-20',
    orderedBy: DR_OKAFOR,
    results: [
      ['creatinine', 145],
      ['egfr', 52],
    ],
    notes: 'Renal function declined — review nephrotoxic medication.',
  }),
  createSet({
    id: 'lab-2010',
    panel: 'Coagulation',
    collectedOn: '2026-08-20',
    orderedBy: DR_OKAFOR,
    results: [['inr', 4.8]],
    notes: 'INR above target range. Reduce warfarin and recheck in 3 days.',
  }),
  createSet({
    id: 'lab-2011',
    panel: 'Thyroid',
    collectedOn: '2026-08-20',
    orderedBy: DR_OKAFOR,
    results: [['tsh', 6.9]],
    notes: 'Raised TSH — consider increasing levothyroxine.',
  }),
  createSet({
    id: 'lab-2012',
    panel: 'Inflammation',
    collectedOn: '2026-08-20',
    orderedBy: DR_OKAFOR,
    results: [['crp', 22]],
  }),
  createSet({
    id: 'lab-2013',
    panel: 'Full blood count',
    collectedOn: '2026-09-15',
    orderedBy: DR_OKAFOR,
    results: [
      ['haemoglobin', 6.8],
      ['wbc', 9.2],
      ['platelets', 210],
    ],
    status: 'corrected',
    notes: 'Critical anaemia — urgent clinical review documented.',
  }),
  createSet({
    id: 'lab-2014',
    panel: 'Coagulation',
    collectedOn: '2026-09-15',
    orderedBy: DR_OKAFOR,
    results: [['inr', 5.4]],
    notes: 'Critical INR — anticoagulation withheld, vitamin K considered.',
  }),
  createSet({
    id: 'lab-3001',
    patientId: 'p-1002',
    panel: 'Renal function',
    collectedOn: '2026-07-08',
    orderedBy: DR_BALOGUN,
    results: [
      ['creatinine', 88],
      ['egfr', 92],
    ],
  }),
  createSet({
    id: 'lab-3002',
    patientId: 'p-1002',
    panel: 'Electrolytes',
    collectedOn: '2026-07-08',
    orderedBy: DR_BALOGUN,
    results: [
      ['sodium', 140],
      ['potassium', 4.2],
    ],
  }),
];

export function getSampleLabSets(patientId: string): LabResultSet[] {
  return SAMPLE_LAB_RESULT_SETS.filter((set) => set.patientId === patientId);
}

export function getSampleLabPatient(patientId: string): PatientSummary {
  const found = SAMPLE_LAB_PATIENTS.find((patient) => patient.id === patientId);
  return found ?? (SAMPLE_LAB_PATIENTS[0] as PatientSummary);
}
