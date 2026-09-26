/**
 * HL7 v2.5.1 message builder for patient data export (Issue #1243).
 *
 * Supports:
 *   ADT^A28 – Patient Register (demographics)
 *   ORU^R01 – Observation Result (lab results / vitals)
 *   RDE^O11 – Pharmacy Order (prescriptions)
 *
 * Wire format: pipe-delimited vertical-bar encoding per HL7 v2 spec.
 * Each segment is terminated with <CR> (0x0D).
 */

import { v4 as uuidv4 } from 'uuid';

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Escape special HL7 characters in a field value */
function escapeHl7(value: string | undefined | null): string {
  if (!value) return '';
  return String(value)
    .replace(/\|/g, '\\F\\')
    .replace(/\^/g, '\\S\\')
    .replace(/&/g, '\\T\\')
    .replace(/~/g, '\\R\\')
    .replace(/\\/g, '\\E\\');
}

/** Format a JS Date → HL7 DTM string (YYYYMMDDHHmmss) */
function dtm(date?: Date | string): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/** Format a JS Date → HL7 date-only string (YYYYMMDD) */
function dateOnly(date?: Date | string): string {
  return dtm(date).slice(0, 8);
}

/** Build the MSH segment common to all message types */
function buildMSH(messageType: string, triggerEvent: string, messageControlId: string): string {
  const sendingApp = escapeHl7('HEALTH-WATCHERS');
  const sendingFacility = escapeHl7('HW');
  const timestamp = dtm(new Date());
  const msgType = `${escapeHl7(messageType)}^${escapeHl7(triggerEvent)}`;
  const version = '2.5.1';
  // MSH.1 = field separator, MSH.2 = encoding characters
  return `MSH|^~\\&|${sendingApp}|${sendingFacility}|||${timestamp}||${msgType}|${messageControlId}|P|${version}`;
}

// ─── ADT^A28 Patient Registration ────────────────────────────────────────────

/**
 * Build an ADT^A28 (Register a Patient) HL7 v2 message.
 * Contains MSH + EVN + PID + PV1.
 */
export function buildAdtA28(patient: any): string {
  const msgId = uuidv4().replace(/-/g, '').slice(0, 20);
  const msh = buildMSH('ADT', 'A28', msgId);

  // EVN segment
  const evn = `EVN|A28|${dtm(new Date())}`;

  // PID segment
  const pid = buildPid(patient);

  // PV1 – minimal ambulatory visit placeholder
  const pv1 = 'PV1|1|O|||||||||||||||||||V';

  return [msh, evn, pid, pv1].join('\r') + '\r';
}

function buildPid(patient: any): string {
  const pid1 = '1'; // set ID
  const pid2 = ''; // patient ID (external – deprecated in v2.5)
  const pid3 = escapeHl7(patient.systemId ?? ''); // patient identifier list
  const pid4 = ''; // alternate patient ID (deprecated)
  const pid5 = `${escapeHl7(patient.lastName)}^${escapeHl7(patient.firstName)}`; // name
  const pid6 = ''; // mother's maiden name
  const pid7 = dateOnly(patient.dateOfBirth); // DOB
  const pid8 = escapeHl7(patient.sex === 'M' ? 'M' : patient.sex === 'F' ? 'F' : 'U'); // sex
  const pid9 = ''; // patient alias
  const pid10 = ''; // race
  const pid11 = escapeHl7(patient.address ?? ''); // address
  const pid12 = ''; // county code (deprecated)
  const pid13 = escapeHl7(patient.contactNumber ?? ''); // phone home
  const pid14 = ''; // phone business

  return `PID|${pid1}|${pid2}|${pid3}|${pid4}|${pid5}|${pid6}|${pid7}|${pid8}|${pid9}|${pid10}|${pid11}|${pid12}|${pid13}|${pid14}`;
}

// ─── ORU^R01 Observation Result ───────────────────────────────────────────────

/**
 * Build an ORU^R01 (Observation Result) HL7 v2 message for lab results.
 */
export function buildOruR01(patient: any, labResults: any[]): string {
  const msgId = uuidv4().replace(/-/g, '').slice(0, 20);
  const msh = buildMSH('ORU', 'R01', msgId);
  const pid = buildPid(patient);

  // One OBR + OBX per lab result
  const observationSegments: string[] = [];
  labResults.forEach((lab, index) => {
    const obr = buildObr(lab, index + 1);
    const obx = buildObx(lab, index + 1);
    observationSegments.push(obr, obx);
  });

  return [msh, pid, ...observationSegments].join('\r') + '\r';
}

function buildObr(lab: any, setId: number): string {
  const testName = escapeHl7(lab.testName ?? 'UNKNOWN');
  const orderedAt = dtm(lab.createdAt);
  return `OBR|${setId}|${escapeHl7(String(lab._id ?? ''))}||${testName}|||${orderedAt}`;
}

function buildObx(lab: any, setId: number): string {
  const valueType = 'ST'; // string
  const obsId = escapeHl7(lab.testName ?? 'UNKNOWN');
  const value = escapeHl7(String(lab.result ?? lab.status ?? ''));
  const units = escapeHl7(lab.unit ?? '');
  const status = 'F'; // final
  return `OBX|${setId}|${valueType}|${obsId}||${value}|${units}|||||${status}`;
}

// ─── RDE^O11 Pharmacy/Treatment Order ────────────────────────────────────────

/**
 * Build an RDE^O11 (Pharmacy Order) HL7 v2 message for prescriptions.
 */
export function buildRdeO11(patient: any, prescriptions: any[]): string {
  const msgId = uuidv4().replace(/-/g, '').slice(0, 20);
  const msh = buildMSH('RDE', 'O11', msgId);
  const pid = buildPid(patient);

  const rxSegments: string[] = [];
  prescriptions.forEach((rx, index) => {
    rxSegments.push(buildRxe(rx, index + 1));
  });

  return [msh, pid, ...rxSegments].join('\r') + '\r';
}

function buildRxe(rx: any, setId: number): string {
  const drugName = escapeHl7(rx.drugName ?? rx.name ?? 'UNKNOWN');
  const dosage = escapeHl7(rx.dosage ?? '');
  const dosageUnits = escapeHl7(rx.dosageUnit ?? '');
  const frequency = escapeHl7(rx.frequency ?? '');
  const route = escapeHl7(rx.route ?? '');
  return `RXE|${setId}|${drugName}||${dosage}|${dosageUnits}|${route}|${frequency}`;
}

// ─── Full patient HL7 bundle ──────────────────────────────────────────────────

export interface Hl7Bundle {
  /** ADT^A28 demographics message */
  adt: string;
  /** ORU^R01 lab results message (empty string if no results) */
  oru: string;
  /** RDE^O11 prescription message (empty string if no prescriptions) */
  rde: string;
}

/**
 * Build all HL7 v2 messages for a patient export.
 * Prescriptions are extracted from encounter.prescriptions arrays.
 */
export function buildHl7Bundle(
  patient: any,
  encounters: any[],
  labResults: any[] = []
): Hl7Bundle {
  const prescriptions: any[] = [];
  for (const enc of encounters) {
    for (const rx of enc.prescriptions ?? []) {
      prescriptions.push({ ...rx, encounterId: String(enc._id) });
    }
  }

  return {
    adt: buildAdtA28(patient),
    oru: labResults.length > 0 ? buildOruR01(patient, labResults) : '',
    rde: prescriptions.length > 0 ? buildRdeO11(patient, prescriptions) : '',
  };
}
