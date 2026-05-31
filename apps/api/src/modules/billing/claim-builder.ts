export interface EncounterBillingInput {
  encounterId: string;
  patientId: string;
  clinicId: string;
  clinicNpi: string;
  patientDob: string;       // YYYY-MM-DD
  patientName: string;
  serviceDate: string;      // YYYY-MM-DD
  cptCodes: string[];
  diagnosisCodes: string[]; // ICD-10
  amounts: number[];        // per CPT code, same order
}

/** CMS-1500 (02/12) form data structure — key field names match form box numbers */
export function buildCms1500(input: EncounterBillingInput): Record<string, unknown> {
  const totalCharge = input.amounts.reduce((s, a) => s + a, 0);
  return {
    box1_insuranceType: 'OTHER',
    box2_patientName: input.patientName,
    box3_patientDob: input.patientDob,
    box21_diagnosisCodes: input.diagnosisCodes.slice(0, 12), // max 12
    box24_servicelines: input.cptCodes.map((cpt, i) => ({
      dateOfService: input.serviceDate,
      placeOfService: '11', // Office
      cptCode: cpt,
      diagnosisPointers: ['A'],
      charges: input.amounts[i] ?? 0,
      units: 1,
    })),
    box28_totalCharge: totalCharge,
    box33_billingProviderNpi: input.clinicNpi,
    _meta: { generatedAt: new Date().toISOString(), encounterId: input.encounterId },
  };
}

/**
 * Builds a minimal EDI 837P (Professional) transaction set.
 * Production use requires a certified clearinghouse library —
 * this stub produces a structurally valid skeleton for integration.
 */
export function buildEdi837(input: EncounterBillingInput): string {
  const today = input.serviceDate.replace(/-/g, '');
  const totalCents = Math.round(input.amounts.reduce((s, a) => s + a, 0) * 100);

  const lines = [
    `ISA*00*          *00*          *ZZ*${input.clinicNpi.padEnd(15)}*ZZ*CLEARINGHOUSE   *${today}*0000*^*00501*000000001*0*P*:~`,
    `GS*HC*${input.clinicNpi}*CLEARINGHOUSE*${today}*0000*1*X*005010X222A1~`,
    `ST*837*0001*005010X222A1~`,
    `BPR*I*${(totalCents / 100).toFixed(2)}*C*ACH~`,
    `NM1*85*2*CLINIC*****XX*${input.clinicNpi}~`,
    `NM1*QC*1*${input.patientName}*****MI*${input.patientId}~`,
    ...input.cptCodes.map((cpt, i) =>
      `SV1*HC:${cpt}*${(input.amounts[i] ?? 0).toFixed(2)}*UN*1***${
        input.diagnosisCodes.slice(0, 4).map((_, j) => String.fromCharCode(65 + j)).join(':')
      }~`
    ),
    `SE*${8 + input.cptCodes.length}*0001~`,
    `GE*1*1~`,
    `IEA*1*000000001~`,
  ];
  return lines.join('\n');
}
