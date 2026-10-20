import type { Drug, DrugInteraction } from './types';

/**
 * Local formulary used to power medication search/autocomplete and the
 * interaction knowledge base. In production this list is hydrated from the
 * clinic formulary endpoint; the shape is intentionally identical.
 */
export const DRUG_CATALOG: Drug[] = [
  {
    id: 'warfarin',
    name: 'Warfarin',
    genericName: 'warfarin sodium',
    drugClass: 'Anticoagulant',
    commonDosages: ['1 mg', '2 mg', '5 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'ibuprofen',
    name: 'Ibuprofen',
    genericName: 'ibuprofen',
    drugClass: 'NSAID',
    commonDosages: ['200 mg', '400 mg', '600 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'aspirin',
    name: 'Aspirin',
    genericName: 'acetylsalicylic acid',
    drugClass: 'Antiplatelet / NSAID',
    commonDosages: ['75 mg', '81 mg', '300 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'lisinopril',
    name: 'Lisinopril',
    genericName: 'lisinopril',
    drugClass: 'ACE inhibitor',
    commonDosages: ['5 mg', '10 mg', '20 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'spironolactone',
    name: 'Spironolactone',
    genericName: 'spironolactone',
    drugClass: 'Potassium-sparing diuretic',
    commonDosages: ['25 mg', '50 mg', '100 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'furosemide',
    name: 'Furosemide',
    genericName: 'furosemide',
    drugClass: 'Loop diuretic',
    commonDosages: ['20 mg', '40 mg', '80 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'digoxin',
    name: 'Digoxin',
    genericName: 'digoxin',
    drugClass: 'Cardiac glycoside',
    commonDosages: ['0.0625 mg', '0.125 mg', '0.25 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'atorvastatin',
    name: 'Atorvastatin',
    genericName: 'atorvastatin calcium',
    drugClass: 'Statin',
    commonDosages: ['10 mg', '20 mg', '40 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'clarithromycin',
    name: 'Clarithromycin',
    genericName: 'clarithromycin',
    drugClass: 'Macrolide antibiotic',
    commonDosages: ['250 mg', '500 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'amoxicillin',
    name: 'Amoxicillin',
    genericName: 'amoxicillin',
    drugClass: 'Penicillin antibiotic',
    commonDosages: ['250 mg', '500 mg', '875 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'metformin',
    name: 'Metformin',
    genericName: 'metformin hydrochloride',
    drugClass: 'Biguanide antidiabetic',
    commonDosages: ['500 mg', '850 mg', '1000 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'insulin-glargine',
    name: 'Insulin glargine',
    genericName: 'insulin glargine',
    drugClass: 'Long-acting insulin',
    commonDosages: ['10 units', '20 units', '30 units'],
    defaultRoute: 'injection',
  },
  {
    id: 'levothyroxine',
    name: 'Levothyroxine',
    genericName: 'levothyroxine sodium',
    drugClass: 'Thyroid hormone',
    commonDosages: ['25 mcg', '50 mcg', '100 mcg'],
    defaultRoute: 'oral',
  },
  {
    id: 'omeprazole',
    name: 'Omeprazole',
    genericName: 'omeprazole',
    drugClass: 'Proton pump inhibitor',
    commonDosages: ['20 mg', '40 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'amlodipine',
    name: 'Amlodipine',
    genericName: 'amlodipine besylate',
    drugClass: 'Calcium channel blocker',
    commonDosages: ['2.5 mg', '5 mg', '10 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'sertraline',
    name: 'Sertraline',
    genericName: 'sertraline hydrochloride',
    drugClass: 'SSRI antidepressant',
    commonDosages: ['25 mg', '50 mg', '100 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'tramadol',
    name: 'Tramadol',
    genericName: 'tramadol hydrochloride',
    drugClass: 'Opioid analgesic',
    commonDosages: ['50 mg', '100 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'paracetamol',
    name: 'Paracetamol',
    genericName: 'acetaminophen',
    drugClass: 'Analgesic / antipyretic',
    commonDosages: ['500 mg', '1000 mg'],
    defaultRoute: 'oral',
  },
  {
    id: 'salbutamol',
    name: 'Salbutamol',
    genericName: 'albuterol sulfate',
    drugClass: 'Short-acting beta agonist',
    commonDosages: ['100 mcg/actuation'],
    defaultRoute: 'inhalation',
  },
  {
    id: 'prednisolone',
    name: 'Prednisolone',
    genericName: 'prednisolone',
    drugClass: 'Corticosteroid',
    commonDosages: ['5 mg', '10 mg', '25 mg'],
    defaultRoute: 'oral',
  },
];

/** Drug–drug interaction knowledge base (curated demo subset). */
export const DRUG_INTERACTIONS: DrugInteraction[] = [
  {
    id: 'warfarin-ibuprofen',
    drugIds: ['warfarin', 'ibuprofen'],
    severity: 'major',
    description:
      'NSAIDs increase the anticoagulant effect of warfarin and add antiplatelet activity, markedly raising bleeding risk.',
    management:
      'Avoid the combination where possible. If unavoidable, use the lowest dose, add gastroprotection and monitor INR closely.',
  },
  {
    id: 'warfarin-aspirin',
    drugIds: ['warfarin', 'aspirin'],
    severity: 'major',
    description:
      'Concurrent antiplatelet and anticoagulant therapy significantly increases the risk of major haemorrhage.',
    management:
      'Reserve for a clear cardiovascular indication, document the decision and review bleeding risk regularly.',
  },
  {
    id: 'warfarin-amoxicillin',
    drugIds: ['warfarin', 'amoxicillin'],
    severity: 'moderate',
    description:
      'Antibiotic disruption of gut flora can potentiate warfarin and prolong the INR.',
    management: 'Check INR 3–5 days after starting the antibiotic and adjust the warfarin dose.',
  },
  {
    id: 'lisinopril-ibuprofen',
    drugIds: ['lisinopril', 'ibuprofen'],
    severity: 'moderate',
    description:
      'NSAIDs reduce the antihypertensive effect of ACE inhibitors and may impair renal function.',
    management:
      'Prefer paracetamol for analgesia; if an NSAID is required, monitor blood pressure and renal function.',
  },
  {
    id: 'lisinopril-spironolactone',
    drugIds: ['lisinopril', 'spironolactone'],
    severity: 'major',
    description:
      'ACE inhibitor plus a potassium-sparing diuretic can cause severe hyperkalaemia and renal impairment.',
    management:
      'Monitor serum potassium and creatinine within 1–2 weeks of initiation and after every dose change.',
  },
  {
    id: 'atorvastatin-clarithromycin',
    drugIds: ['atorvastatin', 'clarithromycin'],
    severity: 'major',
    description:
      'Clarithromycin inhibits CYP3A4 and raises statin exposure, increasing the risk of myopathy and rhabdomyolysis.',
    management:
      'Suspend the statin for the duration of the antibiotic course or select a non-interacting antibiotic.',
  },
  {
    id: 'levothyroxine-omeprazole',
    drugIds: ['levothyroxine', 'omeprazole'],
    severity: 'moderate',
    description:
      'Reduced gastric acidity decreases levothyroxine absorption and may cause loss of thyroid control.',
    management:
      'Separate administration by at least 4 hours and recheck TSH 6–8 weeks after starting the PPI.',
  },
  {
    id: 'sertraline-tramadol',
    drugIds: ['sertraline', 'tramadol'],
    severity: 'major',
    description:
      'Both agents increase serotonergic activity and lower the seizure threshold — serotonin syndrome risk.',
    management:
      'Use an alternative analgesic where possible. If combined, counsel on warning signs and use the lowest effective doses.',
  },
  {
    id: 'digoxin-furosemide',
    drugIds: ['digoxin', 'furosemide'],
    severity: 'moderate',
    description:
      'Diuretic-induced hypokalaemia increases digoxin toxicity even at therapeutic digoxin levels.',
    management: 'Monitor potassium and digoxin levels; replace potassium as needed.',
  },
  {
    id: 'metformin-prednisolone',
    drugIds: ['metformin', 'prednisolone'],
    severity: 'moderate',
    description:
      'Corticosteroids antagonise glucose control and can reduce the effectiveness of antidiabetic therapy.',
    management:
      'Increase glucose monitoring during steroid therapy and review the antidiabetic dose.',
  },
  {
    id: 'salbutamol-prednisolone',
    drugIds: ['salbutamol', 'prednisolone'],
    severity: 'minor',
    description:
      'Corticosteroid-induced hypokalaemia may be aggravated by beta-2 agonist therapy.',
    management: 'Monitor potassium in patients receiving repeated nebulised doses.',
  },
];

/** Case-insensitive search across brand name, generic name and drug class. */
export function searchDrugs(query: string, limit = 8): Drug[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];

  const matches: Drug[] = [];
  for (const drug of DRUG_CATALOG) {
    const haystack = `${drug.name} ${drug.genericName} ${drug.drugClass}`.toLowerCase();
    if (haystack.includes(term)) matches.push(drug);
    if (matches.length >= limit) break;
  }
  return matches;
}

export function getDrugById(drugId: string): Drug | null {
  return DRUG_CATALOG.find((drug) => drug.id === drugId) ?? null;
}

export function getInteraction(drugIdA: string, drugIdB: string): DrugInteraction | null {
  return (
    DRUG_INTERACTIONS.find((interaction) => {
      const [first, second] = interaction.drugIds;
      return (first === drugIdA && second === drugIdB) || (first === drugIdB && second === drugIdA);
    }) ?? null
  );
}
