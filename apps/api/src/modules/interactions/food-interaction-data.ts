/**
 * Drug–food interaction database (Issue #1244)
 *
 * Curated food-interaction warnings keyed by generic drug name. Versioned so
 * `POST /interactions/refresh` can merge updated CDC/FDA guidance.
 */

export interface FoodInteractionRecord {
  drug: string;
  food: string;
  severity: 'critical' | 'major' | 'moderate' | 'minor';
  effect: string;
  management: string;
  source: string;
}

export const FOOD_INTERACTION_DATA: FoodInteractionRecord[] = [
  {
    drug: 'lovastatin',
    food: 'grapefruit juice',
    severity: 'critical',
    effect:
      'Grapefruit inhibits CYP3A4, markedly increasing lovastatin exposure and rhabdomyolysis risk.',
    management: 'Avoid grapefruit juice entirely while taking lovastatin.',
    source: 'FDA',
  },
  {
    drug: 'simvastatin',
    food: 'grapefruit juice',
    severity: 'major',
    effect: 'Grapefruit inhibits CYP3A4, increasing simvastatin exposure and myopathy risk.',
    management: 'Avoid large amounts of grapefruit juice; limit simvastatin dose.',
    source: 'FDA',
  },
  {
    drug: 'atorvastatin',
    food: 'grapefruit juice',
    severity: 'moderate',
    effect: 'Grapefruit increases atorvastatin exposure modestly.',
    management: 'Avoid large quantities of grapefruit juice.',
    source: 'FDA',
  },
  {
    drug: 'warfarin',
    food: 'vitamin K-rich foods',
    severity: 'moderate',
    effect: 'High vitamin K intake reduces warfarin effect.',
    management: 'Keep vitamin K intake consistent; monitor INR.',
    source: 'CDC',
  },
  {
    drug: 'warfarin',
    food: 'cranberry juice',
    severity: 'moderate',
    effect: 'Cranberry may potentiate warfarin and increase INR.',
    management: 'Avoid large amounts; monitor INR.',
    source: 'FDA',
  },
  {
    drug: 'phenelzine',
    food: 'tyramine-rich foods',
    severity: 'critical',
    effect: 'Tyramine accumulation can precipitate a hypertensive crisis.',
    management: 'Avoid aged cheeses, cured meats, fermented foods, and beer/wine.',
    source: 'FDA',
  },
  {
    drug: 'tranylcypromine',
    food: 'tyramine-rich foods',
    severity: 'critical',
    effect: 'Tyramine accumulation can precipitate a hypertensive crisis.',
    management: 'Avoid aged cheeses, cured meats, fermented foods, and beer/wine.',
    source: 'FDA',
  },
  {
    drug: 'metronidazole',
    food: 'alcohol',
    severity: 'major',
    effect: 'Disulfiram-like reaction: flushing, nausea, tachycardia.',
    management: 'Avoid alcohol during and for 48 hours after treatment.',
    source: 'FDA',
  },
  {
    drug: 'metformin',
    food: 'alcohol',
    severity: 'moderate',
    effect: 'Excessive alcohol increases lactic acidosis risk.',
    management: 'Avoid heavy alcohol use; take metformin with meals.',
    source: 'FDA',
  },
  {
    drug: 'levothyroxine',
    food: 'calcium and iron supplements',
    severity: 'moderate',
    effect: 'Calcium/iron reduce levothyroxine absorption.',
    management: 'Separate levothyroxine and supplements by at least 4 hours.',
    source: 'FDA',
  },
  {
    drug: 'digoxin',
    food: 'licorice',
    severity: 'moderate',
    effect: 'Licorice can cause potassium loss and increase digoxin toxicity.',
    management: 'Avoid licorice; monitor potassium and digoxin levels.',
    source: 'FDA',
  },
  {
    drug: 'doxycycline',
    food: 'dairy products',
    severity: 'moderate',
    effect: 'Calcium chelates the antibiotic, reducing absorption.',
    management: 'Take doxycycline at least 2 hours from dairy.',
    source: 'FDA',
  },
  {
    drug: 'tetracycline',
    food: 'dairy products',
    severity: 'moderate',
    effect: 'Calcium chelates the antibiotic, reducing absorption.',
    management: 'Take tetracycline at least 2 hours from dairy.',
    source: 'FDA',
  },
  {
    drug: 'ciprofloxacin',
    food: 'dairy products',
    severity: 'moderate',
    effect: 'Calcium chelates the antibiotic, reducing absorption.',
    management: 'Take ciprofloxacin at least 2 hours from dairy.',
    source: 'FDA',
  },
  {
    drug: 'lisinopril',
    food: 'potassium salt substitutes',
    severity: 'major',
    effect: 'Potassium-containing salt substitutes increase hyperkalemia risk.',
    management: 'Avoid potassium-based salt substitutes.',
    source: 'FDA',
  },
];

export const FOOD_INTERACTION_DATA_VERSION = '2026.1';
