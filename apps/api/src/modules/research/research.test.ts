/**
 * Tests for the research module — anonymization, audit logging, and
 * export safety (no direct identifiers in output).
 *
 * Issue: #1485
 */

// ── Module mocks ───────────────────────────────────────────────────────────────

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    find: jest.fn(),
  },
}));

jest.mock('@api/modules/encounters/encounter.model', () => ({
  EncounterModel: {
    find: jest.fn(),
  },
}));

jest.mock('@health-watchers/anonymize', () => ({
  anonymizeBatch: jest.fn(),
  createAuditLog: jest.fn(),
}));

jest.mock('@api/modules/audit/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { PatientModel } from '../patients/models/patient.model';
import { EncounterModel } from '../encounters/encounter.model';
import { anonymizeBatch, createAuditLog } from '@health-watchers/anonymize';
import { AuditService } from '../audit/audit.service';
import { ResearchController } from './research.controller';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRes() {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as jest.Mocked<Response>;
}

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    user: { userId: 'admin-1', clinicId: 'clinic-1', role: 'SUPER_ADMIN' },
    query: { irbApproval: 'true' },
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('jest-test-agent'),
    ...overrides,
  } as unknown as Request;
}

function makePatient(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'p-1',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: new Date('1985-03-15'),
    contactNumber: '+1234567890',
    address: '123 Main St',
    email: 'john@test.com',
    systemId: 'SYS-001',
    sex: 'male',
    isActive: true,
    ...overrides,
  };
}

function mockPatientFind(patients: unknown[]) {
  (PatientModel.find as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(patients) });
}

function mockEncounterFind(encounters: unknown[]) {
  (EncounterModel.find as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(encounters) });
}

// Default anonymizeBatch returns an object with counts only — no direct identifiers
const ANONYMIZED_RESULT = {
  totalRecords: 1,
  ageGroupDistribution: { '30-39': 1 },
};

// ── Lifecycle ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (anonymizeBatch as jest.Mock).mockReturnValue(ANONYMIZED_RESULT);
  (createAuditLog as jest.Mock).mockReturnValue({ fields: [], action: 'research export' });
  mockPatientFind([makePatient()]);
  mockEncounterFind([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// exportAnonymizedData — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('exportAnonymizedData — happy path', () => {
  it('returns 200 with success:true', async () => {
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('calls anonymizeBatch with level=aggregation', async () => {
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);
    expect(anonymizeBatch).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ level: 'aggregation', purpose: 'research' })
    );
  });

  it('includes anonymizationLevel in response', async () => {
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.anonymizationLevel).toBe('aggregation');
  });

  it('creates an audit log entry for the export', async () => {
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research_export',
        resourceType: 'research',
      })
    );
  });

  it('includes exportedAt timestamp in the response', async () => {
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.exportedAt).toBeDefined();
    expect(new Date(payload.data.exportedAt).getTime()).not.toBeNaN();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportAnonymizedData — no direct identifiers in output
// ─────────────────────────────────────────────────────────────────────────────

describe('exportAnonymizedData — no direct identifiers in output', () => {
  it('does NOT include firstName in the anonymized output', async () => {
    (anonymizeBatch as jest.Mock).mockReturnValue(ANONYMIZED_RESULT);
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(payload.data)).not.toContain('John');
  });

  it('does NOT include lastName in the anonymized output', async () => {
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(payload.data)).not.toContain('Doe');
  });

  it('does NOT include contactNumber in the anonymized output', async () => {
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(payload.data)).not.toContain('+1234567890');
  });

  it('does NOT include email in the anonymized output', async () => {
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(payload.data)).not.toContain('john@test.com');
  });

  it('uses @health-watchers/anonymize checks on the exported records', async () => {
    mockPatientFind([makePatient(), makePatient({ _id: 'p-2' })]);
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    // anonymizeBatch must be called with an array matching the patient count
    const [records] = (anonymizeBatch as jest.Mock).mock.calls[0];
    expect(records).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportAnonymizedData — encounter statistics
// ─────────────────────────────────────────────────────────────────────────────

describe('exportAnonymizedData — encounter statistics', () => {
  it('includes encounter stats when includeEncounters=true', async () => {
    mockEncounterFind([
      { encounterType: 'consultation' },
      { encounterType: 'follow-up' },
      { encounterType: 'consultation' },
    ]);

    const req = makeReq({ query: { irbApproval: 'true', includeEncounters: 'true' } });
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.totalEncounters).toBe(3);
    expect(payload.data.encountersByType).toMatchObject({
      consultation: 2,
      'follow-up': 1,
    });
  });

  it('does NOT include encounter stats when includeEncounters is omitted', async () => {
    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.totalEncounters).toBeUndefined();
  });

  it('counts encounters by type correctly (aggregation stage)', async () => {
    mockEncounterFind([
      { encounterType: 'emergency' },
      { encounterType: 'emergency' },
      { encounterType: 'emergency' },
      { encounterType: 'routine' },
    ]);

    const req = makeReq({ query: { irbApproval: 'true', includeEncounters: 'true' } });
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    // Removing the emergency type grouping would make this fail
    expect(payload.data.encountersByType.emergency).toBe(3);
    expect(payload.data.encountersByType.routine).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportAnonymizedData — validation / error cases
// ─────────────────────────────────────────────────────────────────────────────

describe('exportAnonymizedData — validation', () => {
  it('returns 400 when irbApproval is not "true"', async () => {
    const req = makeReq({ query: { irbApproval: 'false' } });
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when irbApproval is missing', async () => {
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected DB error', async () => {
    (PatientModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockRejectedValue(new Error('DB down')),
    });

    const req = makeReq();
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('audit log records the requesting userId', async () => {
    const req = makeReq({ user: { userId: 'my-admin', clinicId: 'c1', role: 'SUPER_ADMIN' } });
    const res = makeRes();
    await ResearchController.exportAnonymizedData(req, res);

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'my-admin' })
    );
  });
});
