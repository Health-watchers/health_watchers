import { CPTModel } from './cpt.model';

export const commonCPTCodes = [
  // Office Visits - New Patient
  { code: '99201', description: 'Office visit, new patient, straightforward', category: 'office-visit', defaultFee: '75.00' },
  { code: '99202', description: 'Office visit, new patient, low complexity', category: 'office-visit', defaultFee: '110.00' },
  { code: '99203', description: 'Office visit, new patient, moderate complexity', category: 'office-visit', defaultFee: '150.00' },
  { code: '99204', description: 'Office visit, new patient, moderate to high complexity', category: 'office-visit', defaultFee: '210.00' },
  { code: '99205', description: 'Office visit, new patient, high complexity', category: 'office-visit', defaultFee: '280.00' },
  
  // Office Visits - Established Patient
  { code: '99211', description: 'Office visit, established patient, minimal', category: 'office-visit', defaultFee: '45.00' },
  { code: '99212', description: 'Office visit, established patient, straightforward', category: 'office-visit', defaultFee: '75.00' },
  { code: '99213', description: 'Office visit, established patient, low complexity', category: 'office-visit', defaultFee: '110.00' },
  { code: '99214', description: 'Office visit, established patient, moderate complexity', category: 'office-visit', defaultFee: '165.00' },
  { code: '99215', description: 'Office visit, established patient, high complexity', category: 'office-visit', defaultFee: '220.00' },
  
  // Preventive Care - New Patient
  { code: '99381', description: 'Preventive care, new patient, infant (under 1 year)', category: 'preventive-care', defaultFee: '150.00' },
  { code: '99382', description: 'Preventive care, new patient, child (1-4 years)', category: 'preventive-care', defaultFee: '160.00' },
  { code: '99383', description: 'Preventive care, new patient, child (5-11 years)', category: 'preventive-care', defaultFee: '170.00' },
  { code: '99384', description: 'Preventive care, new patient, adolescent (12-17 years)', category: 'preventive-care', defaultFee: '180.00' },
  { code: '99385', description: 'Preventive care, new patient, adult (18-39 years)', category: 'preventive-care', defaultFee: '190.00' },
  { code: '99386', description: 'Preventive care, new patient, adult (40-64 years)', category: 'preventive-care', defaultFee: '210.00' },
  { code: '99387', description: 'Preventive care, new patient, senior (65+ years)', category: 'preventive-care', defaultFee: '220.00' },
  
  // Preventive Care - Established Patient
  { code: '99391', description: 'Preventive care, established patient, infant (under 1 year)', category: 'preventive-care', defaultFee: '130.00' },
  { code: '99392', description: 'Preventive care, established patient, child (1-4 years)', category: 'preventive-care', defaultFee: '140.00' },
  { code: '99393', description: 'Preventive care, established patient, child (5-11 years)', category: 'preventive-care', defaultFee: '150.00' },
  { code: '99394', description: 'Preventive care, established patient, adolescent (12-17 years)', category: 'preventive-care', defaultFee: '160.00' },
  { code: '99395', description: 'Preventive care, established patient, adult (18-39 years)', category: 'preventive-care', defaultFee: '170.00' },
  { code: '99396', description: 'Preventive care, established patient, adult (40-64 years)', category: 'preventive-care', defaultFee: '190.00' },
  { code: '99397', description: 'Preventive care, established patient, senior (65+ years)', category: 'preventive-care', defaultFee: '200.00' },
  
  // Common Procedures
  { code: '93000', description: 'Electrocardiogram (ECG), complete', category: 'procedure', defaultFee: '85.00' },
  { code: '85025', description: 'Complete blood count (CBC) with differential', category: 'lab', defaultFee: '45.00' },
  { code: '80053', description: 'Comprehensive metabolic panel', category: 'lab', defaultFee: '65.00' },
  { code: '36415', description: 'Venipuncture (blood draw)', category: 'procedure', defaultFee: '25.00' },
  { code: '94010', description: 'Spirometry (lung function test)', category: 'procedure', defaultFee: '95.00' },
  { code: '71045', description: 'Chest X-ray, single view', category: 'imaging', defaultFee: '120.00' },
  { code: '71046', description: 'Chest X-ray, two views', category: 'imaging', defaultFee: '150.00' },
  { code: '73610', description: 'Ankle X-ray, complete', category: 'imaging', defaultFee: '130.00' },
];

export async function seedCPTCodes(): Promise<void> {
  const count = await CPTModel.countDocuments();
  
  if (count === 0) {
    await CPTModel.insertMany(commonCPTCodes);
    console.log(`Seeded ${commonCPTCodes.length} CPT codes`);
  } else {
    console.log('CPT codes already seeded');
  }
}
