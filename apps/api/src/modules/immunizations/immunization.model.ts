import { Schema, Types, model, models } from 'mongoose';

/**
 * CVX vaccine code lookup table (subset of CDC CVX codes)
 * Full list: https://www2a.cdc.gov/vaccines/iis/iisstandards/vaccines.asp?rpt=cvx
 */
export const CVX_CODES: Record<string, string> = {
  '03': 'MMR',
  '08': 'Hepatitis B, adolescent or pediatric',
  '10': 'IPV',
  '17': 'Hib, unspecified formulation',
  '20': 'DTaP',
  '21': 'Varicella',
  '33': 'Pneumococcal polysaccharide PPV23',
  '43': 'Hepatitis B, adult',
  '48': 'Hib (PRP-T)',
  '49': 'Hib (PRP-OMP)',
  '51': 'Hib-Hep B',
  '83': 'Hepatitis A, pediatric/adolescent, 2 dose',
  '85': 'Hepatitis A, unspecified formulation',
  '88': 'Influenza, unspecified formulation',
  '94': 'MMRV',
  '100': 'Pneumococcal conjugate PCV 7',
  '107': 'DTaP, unspecified formulation',
  '110': 'DTaP-Hep B-IPV',
  '113': 'Td (adult), 5 Lf tetanus toxoid',
  '114': 'MCV4P',
  '115': 'Tdap',
  '116': 'Rotavirus, pentavalent',
  '119': 'Rotavirus, monovalent',
  '120': 'DTaP-Hib-IPV',
  '121': 'Zoster live',
  '122': 'Rotavirus, unspecified formulation',
  '130': 'DTaP-IPV',
  '133': 'Pneumococcal conjugate PCV 13',
  '135': 'Influenza, high dose seasonal',
  '136': 'Meningococcal MCV4O',
  '140': 'Influenza, seasonal, injectable, preservative free',
  '141': 'Influenza, seasonal, injectable',
  '150': 'Influenza, injectable, MDCK, preservative free',
  '153': 'Influenza, injectable, MDCK, preservative free, quadrivalent',
  '155': 'Influenza, recombinant, injectable, preservative free',
  '158': 'Influenza, injectable, quadrivalent, contains preservative',
  '161': 'Influenza, injectable, quadrivalent, preservative free',
  '162': 'Meningococcal B, recombinant',
  '163': 'Meningococcal B, OMV',
  '165': 'HPV9',
  '166': 'Influenza, intradermal, quadrivalent, preservative free',
  '168': 'Influenza, trivalent, adjuvanted',
  '171': 'Influenza, quadrivalent, adjuvanted',
  '174': 'Rabies, intramuscular injection',
  '175': 'Rabies, intradermal injection',
  '176': 'PCV15',
  '177': 'PCV20',
  '178': 'COVID-19, mRNA, LNP-S, PF, 100 mcg/0.5 mL dose',
  '207': 'COVID-19, mRNA, LNP-S, PF, 30 mcg/0.3 mL dose',
  '208': 'COVID-19, mRNA, LNP-S, PF, 10 mcg/0.2 mL dose',
  '210': 'COVID-19 vaccine, vector-nr, rS-Ad26, PF, 0.5 mL',
  '211': 'COVID-19, subunit, rS-nanoparticle+Matrix-M1 Adjuvant, PF, 0.5 mL',
  '212': 'COVID-19, mRNA, LNP-S, PF, 3 mcg/0.2 mL dose',
  '213': 'COVID-19 vaccine, unspecified',
  '217': 'COVID-19, mRNA, LNP-S, PF, 30 mcg/0.3 mL dose, tris-sucrose',
  '218': 'COVID-19, mRNA, LNP-S, PF, 10 mcg/0.2 mL dose, tris-sucrose',
  '219': 'COVID-19, mRNA, LNP-S, PF, 3 mcg/0.2 mL dose, tris-sucrose',
  '220': 'COVID-19, mRNA, LNP-S, PF, 50 mcg/0.5 mL dose',
  '221': 'Zoster recombinant',
  '228': 'COVID-19, mRNA, LNP-S, bivalent booster, PF, 25 mcg/0.25 mL',
  '229': 'COVID-19, mRNA, LNP-S, bivalent booster, PF, 50 mcg/0.5 mL',
  '230': 'COVID-19, mRNA, LNP-S, bivalent booster, PF, 10 mcg/0.2 mL',
  '300': 'Dengue tetravalent, live attenuated',
  '301': 'RSV, mRNA, LNP-S, PF, 50 mcg/0.5 mL',
  '302': 'RSV, recombinant, AS01E adjuvanted, PF, 0.5 mL',
};

export type AdministrationRoute =
  | 'Intramuscular'
  | 'Subcutaneous'
  | 'Intradermal'
  | 'Oral'
  | 'Intranasal'
  | 'Intravenous';

export type AdministrationSite =
  | 'Left deltoid'
  | 'Right deltoid'
  | 'Left thigh'
  | 'Right thigh'
  | 'Left arm'
  | 'Right arm'
  | 'Oral'
  | 'Nasal'
  | 'Other';

export interface IAdverseReaction {
  description: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  onsetDate: Date;
  resolvedDate?: Date;
  reportedToVAERS: boolean;
}

export interface IImmunization {
  patientId: Types.ObjectId;
  clinicId: Types.ObjectId;
  vaccineName: string;
  vaccineCode: string; // CVX code
  manufacturer?: string;
  lotNumber?: string;
  administeredDate: Date;
  expiryDate?: Date;
  doseNumber: number;
  seriesComplete: boolean;
  administeredBy: Types.ObjectId; // userId
  site?: AdministrationSite;
  route?: AdministrationRoute;
  adverseReaction?: IAdverseReaction;
  notes?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const adverseReactionSchema = new Schema<IAdverseReaction>(
  {
    description: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe', 'life-threatening'],
      required: true,
    },
    onsetDate: { type: Date, required: true },
    resolvedDate: { type: Date },
    reportedToVAERS: { type: Boolean, default: false },
  },
  { _id: false },
);

const immunizationSchema = new Schema<IImmunization>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    vaccineName: { type: String, required: true, trim: true },
    vaccineCode: { type: String, required: true, trim: true },
    manufacturer: { type: String, trim: true },
    lotNumber: { type: String, trim: true },
    administeredDate: { type: Date, required: true },
    expiryDate: { type: Date },
    doseNumber: { type: Number, required: true, min: 1 },
    seriesComplete: { type: Boolean, default: false },
    administeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    site: {
      type: String,
      enum: [
        'Left deltoid',
        'Right deltoid',
        'Left thigh',
        'Right thigh',
        'Left arm',
        'Right arm',
        'Oral',
        'Nasal',
        'Other',
      ],
    },
    route: {
      type: String,
      enum: [
        'Intramuscular',
        'Subcutaneous',
        'Intradermal',
        'Oral',
        'Intranasal',
        'Intravenous',
      ],
    },
    adverseReaction: { type: adverseReactionSchema },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

// Compound indexes for efficient queries
immunizationSchema.index({ patientId: 1, clinicId: 1, administeredDate: -1 });
immunizationSchema.index({ patientId: 1, vaccineCode: 1 });
immunizationSchema.index({ clinicId: 1, administeredDate: -1 });

export const ImmunizationModel =
  models.Immunization || model<IImmunization>('Immunization', immunizationSchema);
