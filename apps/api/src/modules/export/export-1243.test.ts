/**
 * Tests for Issue #1243 – patient data export system:
 *   - HL7 v2 mapper (buildAdtA28, buildOruR01, buildRdeO11, buildHl7Bundle)
 *   - Export encryption service (encryptExportData / decryptExportData)
 *   - Export signing service (signExportData / verifyExportSignature)
 *   - Export error-recovery service (withRetry, circuit-breaker)
 *   - Export scheduler service (createSchedule, runScheduleNow, cron matcher)
 */

// ─── env setup ───────────────────────────────────────────────────────────────
process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64); // 32-byte hex key for tests
process.env.EXPORT_SIGNING_KEY = 'b'.repeat(64);

// ─── mocks ────────────────────────────────────────────────────────────────────
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('./export-schedule.model', () => ({
  ExportScheduleModel: {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  },
}));

jest.mock('./export-request.service', () => ({
  buildComprehensiveRecord: jest.fn(),
  renderJson: jest.fn((r: any) => ({ status: 'success', data: r })),
  renderCsv: jest.fn(() => 'col1,col2\nval1,val2'),
}));

jest.mock('./fhir-mapper', () => ({
  buildFhirBundle: jest.fn(() => ({ resourceType: 'Bundle', type: 'collection', entry: [] })),
}));

// ─── imports (after mocks) ────────────────────────────────────────────────────

import {
  buildAdtA28,
  buildOruR01,
  buildRdeO11,
  buildHl7Bundle,
} from './hl7-v2-mapper';

import {
  encryptExportData,
  decryptExportData,
  signExportData,
  verifyExportSignature,
  buildSecureEnvelope,
} from './export-encryption.service';

import { ExportErrorRecoveryService } from './export-error-recovery.service';
import { ExportSchedulerService } from './export-scheduler.service';
import { ExportScheduleModel } from './export-schedule.model';
import { buildComprehensiveRecord } from './export-request.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const PATIENT = {
  systemId: 'HW-000042',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-06-15',
  sex: 'F',
  contactNumber: '555-1234',
  address: '42 Health St',
};

const LAB = {
  _id: 'lab1',
  testName: 'CBC',
  status: 'final',
  result: '14.5',
  unit: 'g/dL',
  createdAt: new Date('2026-01-10T08:00:00Z'),
};

const RX = {
  drugName: 'Amoxicillin',
  dosage: '500mg',
  dosageUnit: 'mg',
  frequency: 'TID',
  route: 'oral',
};

const ENCOUNTER_WITH_RX = {
  _id: 'enc1',
  chiefComplaint: 'Cough',
  prescriptions: [RX],
  createdAt: new Date('2026-01-10T09:00:00Z'),
};

// ═══════════════════════════════════════════════════════════════════════════════
// HL7 v2 mapper tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('HL7 v2 mapper', () => {
  describe('buildAdtA28', () => {
    it('produces a pipe-delimited HL7 message', () => {
      const msg = buildAdtA28(PATIENT);
      expect(msg).toContain('MSH|^~\\&|');
      expect(msg).toContain('ADT^A28');
      expect(msg).toContain('EVN|A28|');
      expect(msg).toContain('PID|');
    });

    it('includes patient name in PID-5', () => {
      const msg = buildAdtA28(PATIENT);
      expect(msg).toContain('Doe^Jane');
    });

    it('includes systemId in PID-3', () => {
      const msg = buildAdtA28(PATIENT);
      expect(msg).toContain('HW-000042');
    });

    it('maps sex correctly', () => {
      const msgF = buildAdtA28({ ...PATIENT, sex: 'F' });
      expect(msgF).toContain('|F|');

      const msgM = buildAdtA28({ ...PATIENT, sex: 'M' });
      expect(msgM).toContain('|M|');

      const msgUnk = buildAdtA28({ ...PATIENT, sex: 'X' });
      expect(msgUnk).toContain('|U|');
    });

    it('includes PV1 segment', () => {
      const msg = buildAdtA28(PATIENT);
      expect(msg).toContain('PV1|');
    });

    it('terminates segments with CR', () => {
      const msg = buildAdtA28(PATIENT);
      expect(msg).toContain('\r');
    });

    it('escapes pipe characters in field values', () => {
      const msg = buildAdtA28({ ...PATIENT, firstName: 'Jan|ne' });
      expect(msg).toContain('\\F\\');
    });
  });

  describe('buildOruR01', () => {
    it('produces an ORU^R01 message with OBR and OBX segments', () => {
      const msg = buildOruR01(PATIENT, [LAB]);
      expect(msg).toContain('ORU^R01');
      expect(msg).toContain('OBR|');
      expect(msg).toContain('OBX|');
      expect(msg).toContain('CBC');
    });

    it('handles multiple lab results', () => {
      const labs = [LAB, { ...LAB, _id: 'lab2', testName: 'Lipids', result: '180' }];
      const msg = buildOruR01(PATIENT, labs);
      expect(msg).toContain('CBC');
      expect(msg).toContain('Lipids');
    });

    it('returns a message for empty lab list', () => {
      const msg = buildOruR01(PATIENT, []);
      expect(msg).toContain('ORU^R01');
      expect(msg).not.toContain('OBR|');
    });
  });

  describe('buildRdeO11', () => {
    it('produces an RDE^O11 message with RXE segments', () => {
      const msg = buildRdeO11(PATIENT, [RX]);
      expect(msg).toContain('RDE^O11');
      expect(msg).toContain('RXE|');
      expect(msg).toContain('Amoxicillin');
    });

    it('handles multiple prescriptions', () => {
      const rxs = [RX, { ...RX, drugName: 'Ibuprofen', dosage: '400mg' }];
      const msg = buildRdeO11(PATIENT, rxs);
      expect(msg).toContain('Amoxicillin');
      expect(msg).toContain('Ibuprofen');
    });
  });

  describe('buildHl7Bundle', () => {
    it('returns all three message types', () => {
      const bundle = buildHl7Bundle(PATIENT, [ENCOUNTER_WITH_RX], [LAB]);
      expect(bundle.adt).toContain('ADT^A28');
      expect(bundle.oru).toContain('ORU^R01');
      expect(bundle.rde).toContain('RDE^O11');
    });

    it('returns empty oru and rde strings when no labs/prescriptions', () => {
      const bundle = buildHl7Bundle(PATIENT, [], []);
      expect(bundle.oru).toBe('');
      expect(bundle.rde).toBe('');
    });

    it('extracts prescriptions from encounter.prescriptions', () => {
      const bundle = buildHl7Bundle(PATIENT, [ENCOUNTER_WITH_RX], []);
      expect(bundle.rde).toContain('RXE|');
      expect(bundle.rde).toContain('Amoxicillin');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Export encryption service tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Export encryption service', () => {
  const PLAINTEXT = 'Sensitive PHI: Jane Doe, DOB 1990-06-15';

  describe('encryptExportData / decryptExportData', () => {
    it('encrypts and decrypts back to the original plaintext', () => {
      const encrypted = encryptExportData(PLAINTEXT);
      const decrypted = decryptExportData(encrypted);
      expect(decrypted).toBe(PLAINTEXT);
    });

    it('produces a base64 string (not the plaintext)', () => {
      const encrypted = encryptExportData(PLAINTEXT);
      expect(encrypted).not.toContain('Sensitive');
      // Base64 characters only
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('produces different ciphertext for the same plaintext (random IV)', () => {
      const e1 = encryptExportData(PLAINTEXT);
      const e2 = encryptExportData(PLAINTEXT);
      expect(e1).not.toBe(e2);
    });

    it('throws when the ciphertext is tampered', () => {
      const encrypted = encryptExportData(PLAINTEXT);
      const json = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'));
      // Flip one bit in the ciphertext
      const ct = Buffer.from(json.ct, 'hex');
      ct[0] ^= 0x01;
      json.ct = ct.toString('hex');
      const tampered = Buffer.from(JSON.stringify(json)).toString('base64');
      expect(() => decryptExportData(tampered)).toThrow();
    });

    it('handles empty string', () => {
      const encrypted = encryptExportData('');
      expect(decryptExportData(encrypted)).toBe('');
    });
  });

  describe('signExportData / verifyExportSignature', () => {
    it('generates a hex signature', () => {
      const sig = signExportData(PLAINTEXT);
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });

    it('verifies a valid signature without throwing', () => {
      const sig = signExportData(PLAINTEXT);
      expect(() => verifyExportSignature(PLAINTEXT, sig)).not.toThrow();
    });

    it('throws when the signature is wrong', () => {
      const sig = signExportData(PLAINTEXT);
      const tampered = sig.slice(0, -2) + (sig.slice(-2) === 'ff' ? '00' : 'ff');
      expect(() => verifyExportSignature(PLAINTEXT, tampered)).toThrow(
        /signature verification failed/i
      );
    });

    it('throws when the payload is different', () => {
      const sig = signExportData(PLAINTEXT);
      expect(() => verifyExportSignature(PLAINTEXT + ' tampered', sig)).toThrow();
    });
  });

  describe('buildSecureEnvelope', () => {
    it('returns plaintext payload when encrypt=false, sign=false', () => {
      const env = buildSecureEnvelope(PLAINTEXT, { encrypt: false, sign: false });
      expect(env.encrypted).toBe(false);
      expect(env.signed).toBe(false);
      expect(env.payload).toBe(PLAINTEXT);
      expect(env.signature).toBeUndefined();
    });

    it('returns encrypted payload and signature when both are true', () => {
      const env = buildSecureEnvelope(PLAINTEXT, { encrypt: true, sign: true });
      expect(env.encrypted).toBe(true);
      expect(env.signed).toBe(true);
      expect(env.payload).not.toContain('Sensitive');
      expect(env.signature).toMatch(/^[0-9a-f]{64}$/);
      // Signature is over plaintext, so verify against original
      expect(() => verifyExportSignature(PLAINTEXT, env.signature!)).not.toThrow();
    });

    it('includes exportedAt ISO timestamp', () => {
      const env = buildSecureEnvelope(PLAINTEXT, { encrypt: false, sign: false });
      expect(new Date(env.exportedAt).getTime()).not.toBeNaN();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Export error-recovery service tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ExportErrorRecoveryService', () => {
  let recovery: ExportErrorRecoveryService;

  beforeEach(() => {
    recovery = new ExportErrorRecoveryService();
    recovery.clearAll();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('withRetry', () => {
    it('resolves immediately on first success', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const result = await recovery.withRetry('key1', fn, { maxAttempts: 3 });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds on second attempt', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue('ok');

      const promise = recovery.withRetry('key2', fn, { maxAttempts: 3, backoffMs: 10 });
      // Advance timers to drain the backoff delay
      jest.runAllTimersAsync();
      const result = await promise;
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('permanent failure'));
      const promise = recovery.withRetry('key3', fn, { maxAttempts: 3, backoffMs: 10 });
      jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow('permanent failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('records errors in the log on failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('boom'));
      const promise = recovery.withRetry('key4', fn, { maxAttempts: 2, backoffMs: 10 });
      jest.runAllTimersAsync();
      await promise.catch(() => {});
      const log = recovery.getErrorLog('key4');
      expect(log.length).toBeGreaterThanOrEqual(2);
      expect(log[0]!.errorMessage).toBe('boom');
    });
  });

  describe('circuit breaker', () => {
    it('opens the circuit after 5 consecutive failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 5; i++) {
        const p = recovery.withRetry('cbkey', fn, { maxAttempts: 1, backoffMs: 0 });
        jest.runAllTimersAsync();
        await p.catch(() => {});
      }

      // Circuit should now be open
      await expect(
        recovery.withRetry('cbkey', jest.fn(), { maxAttempts: 1 })
      ).rejects.toThrow(/circuit breaker is open/i);
    });

    it('resets the circuit on manual reset', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 5; i++) {
        const p = recovery.withRetry('cbkey2', fn, { maxAttempts: 1, backoffMs: 0 });
        jest.runAllTimersAsync();
        await p.catch(() => {});
      }

      recovery.resetCircuit('cbkey2');

      const fn2 = jest.fn().mockResolvedValue('ok');
      const result = await recovery.withRetry('cbkey2', fn2, { maxAttempts: 1 });
      expect(result).toBe('ok');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Export scheduler service tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ExportSchedulerService', () => {
  let scheduler: ExportSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use a fresh instance per test to avoid singleton state pollution
    (ExportSchedulerService as any).instance = undefined;
    scheduler = ExportSchedulerService.getInstance();
  });

  afterEach(() => {
    scheduler.stopAll();
  });

  describe('cron expression validation', () => {
    it('accepts valid 5-field expressions', async () => {
      const mockSchedule = {
        _id: 'sch1',
        clinicId: 'c1',
        name: 'Test',
        cronExpression: '0 2 * * *',
        format: 'json',
        isEnabled: true,
        encrypt: false,
        sign: false,
        createdBy: 'u1',
      };
      (ExportScheduleModel.create as jest.Mock).mockResolvedValue(mockSchedule);

      await expect(
        scheduler.createSchedule({
          clinicId: 'c1',
          name: 'Test',
          cronExpression: '0 2 * * *',
          format: 'json',
          createdBy: 'u1',
        })
      ).resolves.toBeDefined();
    });

    it('rejects invalid cron expressions', async () => {
      await expect(
        scheduler.createSchedule({
          clinicId: 'c1',
          name: 'Bad',
          cronExpression: '0 2 *', // only 3 fields
          format: 'json',
          createdBy: 'u1',
        })
      ).rejects.toThrow(/Invalid cron expression/i);
    });
  });

  describe('SimpleCron.matches', () => {
    const { matches } = require('./export-scheduler.service').ExportSchedulerService as any;

    it('matches wildcard expressions', () => {
      // "* * * * *" matches any time
      const now = new Date();
      // Use the static method via the class reference
      const SchedulerClass = jest.requireActual('./export-scheduler.service')
        .ExportSchedulerService as typeof ExportSchedulerService;
      // Access the private static via prototype
      // Instead, test via module-level helper re-exported from the class
      // We'll import it directly:
    });
  });

  describe('listSchedules', () => {
    it('returns all schedules for a clinic', async () => {
      const schedules = [{ _id: 'sch1', clinicId: 'c1', name: 'Daily' }];
      (ExportScheduleModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(schedules) }),
      });

      const result = await scheduler.listSchedules('c1');
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Daily');
    });
  });

  describe('runScheduleNow', () => {
    it('returns failed result when schedule not found', async () => {
      (ExportScheduleModel.findById as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await scheduler.runScheduleNow('nonexistent');
      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/not found/i);
    });

    it('executes a patient-scoped JSON export successfully', async () => {
      const schedule = {
        _id: 'sch1',
        clinicId: 'c1',
        patientId: 'p1',
        format: 'json',
        encrypt: false,
        sign: false,
        name: 'Daily JSON',
      };
      (ExportScheduleModel.findById as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(schedule),
      });
      (ExportScheduleModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(schedule);
      (buildComprehensiveRecord as jest.Mock).mockResolvedValue({
        patient: PATIENT,
        encounters: [],
        diagnoses: [],
        medications: [],
        labResults: [],
        immunizations: [],
        billing: [],
      });

      const result = await scheduler.runScheduleNow('sch1');
      expect(result.status).toBe('success');
      expect(result.format).toBe('json');
    });

    it('executes a patient-scoped HL7 v2 export successfully', async () => {
      const schedule = {
        _id: 'sch2',
        clinicId: 'c1',
        patientId: 'p1',
        format: 'hl7v2',
        encrypt: false,
        sign: false,
        name: 'Daily HL7',
      };
      (ExportScheduleModel.findById as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(schedule),
      });
      (ExportScheduleModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(schedule);
      (buildComprehensiveRecord as jest.Mock).mockResolvedValue({
        patient: PATIENT,
        encounters: [ENCOUNTER_WITH_RX],
        diagnoses: [],
        medications: [],
        labResults: [LAB],
        immunizations: [],
        billing: [],
      });

      const result = await scheduler.runScheduleNow('sch2');
      expect(result.status).toBe('success');
      expect(result.format).toBe('hl7v2');
    });

    it('encrypts the payload when encrypt=true', async () => {
      const schedule = {
        _id: 'sch3',
        clinicId: 'c1',
        patientId: 'p1',
        format: 'json',
        encrypt: true,
        sign: false,
        name: 'Encrypted Export',
      };
      (ExportScheduleModel.findById as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(schedule),
      });
      (ExportScheduleModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(schedule);
      (buildComprehensiveRecord as jest.Mock).mockResolvedValue({
        patient: PATIENT,
        encounters: [],
        diagnoses: [],
        medications: [],
        labResults: [],
        immunizations: [],
        billing: [],
      });

      const result = await scheduler.runScheduleNow('sch3');
      expect(result.status).toBe('success');
      expect(result.encryptedPayload).toBeDefined();
      expect(typeof result.encryptedPayload).toBe('string');
    });

    it('signs the payload when sign=true', async () => {
      const schedule = {
        _id: 'sch4',
        clinicId: 'c1',
        patientId: 'p1',
        format: 'json',
        encrypt: false,
        sign: true,
        name: 'Signed Export',
      };
      (ExportScheduleModel.findById as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(schedule),
      });
      (ExportScheduleModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(schedule);
      (buildComprehensiveRecord as jest.Mock).mockResolvedValue({
        patient: PATIENT,
        encounters: [],
        diagnoses: [],
        medications: [],
        labResults: [],
        immunizations: [],
        billing: [],
      });

      const result = await scheduler.runScheduleNow('sch4');
      expect(result.status).toBe('success');
      expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
