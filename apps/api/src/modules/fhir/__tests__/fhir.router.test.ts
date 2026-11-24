/**
 * FHIR R4 read API (#1435).
 *
 * Every response body is validated against the official HL7 FHIR R4 JSON
 * schema (fixtures/fhir-r4-subset.schema.json, extracted verbatim by
 * scripts/fhir/extract-r4-schema.js), and every request is checked for an
 * audit entry.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import Ajv from 'ajv';

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@api/modules/audit/audit.service', () => ({ auditLog: jest.fn() }));

import { startTestDb, stopTestDb, TestDb } from '../../../integration/helpers/test-db';
import { auditLog } from '@api/modules/audit/audit.service';
import { ApiKeyModel } from '@api/modules/api-keys/models/api-key.model';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { fhirRouter } from '../fhir.router';
import { PATIENT_IDENTIFIER_SYSTEM } from '../fhir.resources';

// ── Official FHIR R4 schema ───────────────────────────────────────────────────
const ajv = new Ajv({ allErrors: true, schemaId: 'auto' });
ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));
const validateFhir = ajv.compile(require('./fixtures/fhir-r4-subset.schema.json'));

/** Set FHIR_DUMP_DIR to save every checked response, e.g. to run the HL7 validator CLI on them. */
let dumped = 0;
function expectValidFhir(body: unknown) {
  if (process.env.FHIR_DUMP_DIR) {
    const name = `${String(++dumped).padStart(3, '0')}-${(body as any).resourceType}.json`;
    fs.writeFileSync(path.join(process.env.FHIR_DUMP_DIR, name), JSON.stringify(body, null, 2));
  }
  const valid = validateFhir(body);
  if (!valid)
    throw new Error(`Invalid FHIR R4: ${ajv.errorsText(validateFhir.errors, { separator: '\n' })}`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const CLINIC_A = new Types.ObjectId().toString();
const CLINIC_B = new Types.ObjectId().toString();
const CREATOR = new Types.ObjectId().toString();
const KEYS = {
  all: `hw_live_${'a'.repeat(64)}`,
  patientOnly: `hw_live_${'b'.repeat(64)}`,
  clinicB: `hw_live_${'c'.repeat(64)}`,
  noFhir: `hw_live_${'d'.repeat(64)}`,
};
const PATIENT_COUNT = 25;
let p1: string; // patient with encounters
let testDb: TestDb;

const app = express();
app.set('trust proxy', true);
app.use('/fhir/r4', fhirRouter);

const fhirGet = (path: string, key: string | null = KEYS.all) => {
  const req = request(app).get(`/fhir/r4${path}`).set('Host', 'fhir.test');
  return key ? req.set('Authorization', `Bearer ${key}`) : req;
};
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

beforeAll(async () => {
  testDb = await startTestDb();
  await ApiKeyModel.create([
    {
      name: 'all',
      clinicId: CLINIC_A,
      keyHash: sha256(KEYS.all),
      prefix: 'hw_live_aaaa',
      scopes: ['patient/*.read'],
      createdBy: CREATOR,
    },
    {
      name: 'patient',
      clinicId: CLINIC_A,
      keyHash: sha256(KEYS.patientOnly),
      prefix: 'hw_live_bbbb',
      scopes: ['patient/Patient.read'],
      createdBy: CREATOR,
    },
    {
      name: 'b',
      clinicId: CLINIC_B,
      keyHash: sha256(KEYS.clinicB),
      prefix: 'hw_live_cccc',
      scopes: ['patient/*.read'],
      createdBy: CREATOR,
    },
    {
      name: 'none',
      clinicId: CLINIC_A,
      keyHash: sha256(KEYS.noFhir),
      prefix: 'hw_live_dddd',
      scopes: ['patients:read'],
      createdBy: CREATOR,
    },
  ]);

  for (let i = 0; i < PATIENT_COUNT; i++) {
    const p = await PatientModel.create({
      systemId: `HW-A-${String(i).padStart(4, '0')}`,
      firstName: `Ada${i}`,
      lastName: 'Lovelace',
      searchName: `ada${i} lovelace`,
      dateOfBirth: '1985-12-10',
      sex: i % 2 ? 'F' : 'M',
      contactNumber: '+15550100',
      address: '1 Analytical Way',
      clinicId: CLINIC_A,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
    });
    if (i === 0) p1 = String(p._id);
  }
  await PatientModel.create({
    systemId: 'HW-B-0001',
    firstName: 'Other',
    lastName: 'Clinic',
    searchName: 'other clinic',
    dateOfBirth: '1970-01-01',
    sex: 'O',
    clinicId: CLINIC_B,
  });

  const doctor = new Types.ObjectId();
  const encounter = (i: number, vitalSigns?: Record<string, unknown>) => ({
    patientId: p1,
    clinicId: CLINIC_A,
    attendingDoctorId: doctor,
    chiefComplaint: `Visit ${i}`,
    status: i === 0 ? 'open' : 'closed',
    type: i === 1 ? 'telemedicine' : 'consultation',
    createdAt: new Date(Date.UTC(2026, 1, 1 + i)),
    ...(vitalSigns ? { vitalSigns } : {}),
  });
  await EncounterModel.create([
    encounter(0, { heartRate: 72, temperature: 36.6, bloodPressure: '120/80', weight: 70 }),
    encounter(1, { oxygenSaturation: 98, bloodPressure: 'n/a' }),
    encounter(2),
  ]);
}, 120_000);

afterAll(async () => {
  // Let fire-and-forget API-key usage writes settle before closing the DB.
  await new Promise((r) => setTimeout(r, 200));
  await stopTestDb(testDb);
});

beforeEach(() => jest.clearAllMocks());

async function lastAudit() {
  // Audit is written on 'finish'; let the event loop flush it.
  await new Promise((r) => setImmediate(r));
  const calls = (auditLog as jest.Mock).mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe('GET /fhir/r4/metadata', () => {
  it('serves a valid CapabilityStatement without authentication', async () => {
    const res = await fhirGet('/metadata', null);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/fhir\+json/);
    expect(res.body.resourceType).toBe('CapabilityStatement');
    expect(res.body.fhirVersion).toBe('4.0.1');
    expect(res.body.rest[0].resource.map((r: any) => r.type)).toEqual([
      'Patient',
      'Encounter',
      'Observation',
    ]);
    expectValidFhir(res.body);
    expect(await lastAudit()).toEqual(
      expect.objectContaining({ action: 'FHIR_ACCESS', outcome: 'SUCCESS' })
    );
  });
});

describe('GET /fhir/r4/Patient/:id', () => {
  it('returns a valid Patient for the key clinic', async () => {
    const res = await fhirGet(`/Patient/${p1}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        resourceType: 'Patient',
        id: p1,
        identifier: [{ system: PATIENT_IDENTIFIER_SYSTEM, value: 'HW-A-0000' }],
        birthDate: '1985-12-10', // decrypted PHI
        gender: 'male',
      })
    );
    expectValidFhir(res.body);
    expect(await lastAudit()).toEqual(
      expect.objectContaining({
        action: 'FHIR_ACCESS',
        resourceType: 'Patient',
        resourceId: p1,
        clinicId: CLINIC_A,
        userId: CREATOR,
        outcome: 'SUCCESS',
      })
    );
  });

  it('accepts the `ApiKey` authorization scheme too', async () => {
    const res = await request(app)
      .get(`/fhir/r4/Patient/${p1}`)
      .set('Authorization', `ApiKey ${KEYS.all}`);
    expect(res.status).toBe(200);
  });

  it('does not leak patients across clinics', async () => {
    const res = await fhirGet(`/Patient/${p1}`, KEYS.clinicB);
    expect(res.status).toBe(404);
    expect(res.body.resourceType).toBe('OperationOutcome');
    expect(res.body.issue[0].code).toBe('not-found');
    expectValidFhir(res.body);
  });

  it('returns OperationOutcome 404 for malformed ids', async () => {
    const res = await fhirGet('/Patient/not-an-id');
    expect(res.status).toBe(404);
    expectValidFhir(res.body);
  });
});

describe('GET /fhir/r4/Patient?identifier=', () => {
  it('finds a patient by identifier value and by system|value', async () => {
    for (const identifier of ['HW-A-0003', `${PATIENT_IDENTIFIER_SYSTEM}|HW-A-0003`]) {
      const res = await fhirGet(`/Patient?identifier=${encodeURIComponent(identifier)}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ resourceType: 'Bundle', type: 'searchset', total: 1 })
      );
      expect(res.body.entry[0].resource.identifier[0].value).toBe('HW-A-0003');
      expect(res.body.entry[0].fullUrl).toMatch(
        /^http:\/\/fhir\.test\/fhir\/r4\/Patient\/[0-9a-f]{24}$/
      );
      expect(res.body.entry[0].search).toEqual({ mode: 'match' });
      expectValidFhir(res.body);
    }
  });

  it('matches nothing for a foreign identifier system', async () => {
    const res = await fhirGet(`/Patient?identifier=${encodeURIComponent('urn:other|HW-A-0003')}`);
    expect(res.body.total).toBe(0);
    expect(res.body.entry).toBeUndefined(); // FHIR forbids empty arrays
    expectValidFhir(res.body);
  });

  it('pages with self/next links until every patient was returned once', async () => {
    const seen = new Set<string>();
    let url: string | undefined = '/Patient?_count=10';
    let pages = 0;
    while (url) {
      const res = await fhirGet(url);
      expect(res.status).toBe(200);
      expectValidFhir(res.body);
      expect(res.body.total).toBe(PATIENT_COUNT);
      expect(res.body.link[0].relation).toBe('self');
      for (const e of res.body.entry) {
        expect(seen.has(e.resource.id)).toBe(false);
        seen.add(e.resource.id);
      }
      const next = res.body.link.find((l: any) => l.relation === 'next');
      url = next ? next.url.replace('http://fhir.test/fhir/r4', '') : undefined;
      if (next) expect(next.url).toContain('_count=10');
      pages++;
    }
    expect(seen.size).toBe(PATIENT_COUNT); // clinic B's patient is not included
    expect(pages).toBe(3);
  });

  it('rejects an invalid _count or cursor with OperationOutcome 400', async () => {
    for (const q of ['_count=0', '_count=500', '_cursor=garbage']) {
      const res = await fhirGet(`/Patient?${q}`);
      expect(res.status).toBe(400);
      expect(res.body.issue[0].code).toBe('invalid');
      expectValidFhir(res.body);
    }
  });
});

describe('GET /fhir/r4/Encounter?patient=', () => {
  it('returns the patient encounters as a valid searchset', async () => {
    const res = await fhirGet(`/Encounter?patient=Patient/${p1}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    const encounters = res.body.entry.map((e: any) => e.resource);
    expect(encounters.every((e: any) => e.subject.reference === `Patient/${p1}`)).toBe(true);
    expect(encounters.map((e: any) => e.status)).toEqual(['finished', 'finished', 'in-progress']);
    expect(encounters[1].class.code).toBe('VR');
    expectValidFhir(res.body);
  });

  it('requires the patient parameter', async () => {
    const res = await fhirGet('/Encounter');
    expect(res.status).toBe(400);
    expectValidFhir(res.body);
  });
});

describe('GET /fhir/r4/Observation?patient=&category=vital-signs', () => {
  it('returns vital-sign Observations with category and BP components', async () => {
    const res = await fhirGet(`/Observation?patient=${p1}&category=vital-signs`);
    expect(res.status).toBe(200);
    expectValidFhir(res.body);

    const obs = res.body.entry.map((e: any) => e.resource);
    const codes = obs.map((o: any) => o.code.coding[0].code).sort();
    // encounter 0: HR, temp, weight, BP · encounter 1: SpO2 (its BP "n/a" is left out)
    expect(codes).toEqual(['2708-6', '29463-7', '8310-5', '85354-9', '8867-4']);
    for (const o of obs) {
      expect(o.category[0].coding[0]).toEqual(
        expect.objectContaining({
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
        })
      );
      expect(o.subject.reference).toBe(`Patient/${p1}`);
    }
    const bp = obs.find((o: any) => o.component);
    expect(bp.component.map((c: any) => [c.code.coding[0].code, c.valueQuantity.value])).toEqual([
      ['8480-6', 120],
      ['8462-4', 80],
    ]);
    expect(await lastAudit()).toEqual(
      expect.objectContaining({ resourceType: 'Observation', outcome: 'SUCCESS' })
    );
  });

  it('accepts a system-qualified category and matches nothing for other categories', async () => {
    const qualified = await fhirGet(
      `/Observation?patient=${p1}&category=${encodeURIComponent('http://terminology.hl7.org/CodeSystem/observation-category|vital-signs')}`
    );
    expect(qualified.body.entry.length).toBe(5);

    const lab = await fhirGet(`/Observation?patient=${p1}&category=laboratory`);
    expect(lab.body.entry).toBeUndefined();
    expectValidFhir(lab.body);
  });

  it('pages by encounter', async () => {
    const first = await fhirGet(`/Observation?patient=${p1}&_count=1`);
    const next = first.body.link.find((l: any) => l.relation === 'next');
    expect(next).toBeDefined();
    const second = await fhirGet(next.url.replace('http://fhir.test/fhir/r4', ''));
    expect(first.body.entry.length + second.body.entry.length).toBe(5);
  });
});

describe('authentication, scopes and auditing', () => {
  it('rejects requests without an API key (401 OperationOutcome, audited)', async () => {
    const res = await fhirGet(`/Patient/${p1}`, null);
    expect(res.status).toBe(401);
    expect(res.body.issue[0].code).toBe('login');
    expectValidFhir(res.body);
    expect(await lastAudit()).toEqual(
      expect.objectContaining({ action: 'FHIR_ACCESS', outcome: 'FAILURE' })
    );
  });

  it('rejects unknown keys', async () => {
    const res = await fhirGet(`/Patient/${p1}`, `hw_live_${'f'.repeat(64)}`);
    expect(res.status).toBe(401);
    expectValidFhir(res.body);
  });

  it('enforces per-resource scopes', async () => {
    expect((await fhirGet(`/Patient/${p1}`, KEYS.patientOnly)).status).toBe(200);

    const res = await fhirGet(`/Encounter?patient=${p1}`, KEYS.patientOnly);
    expect(res.status).toBe(403);
    expect(res.body.issue[0].code).toBe('forbidden');
    expectValidFhir(res.body);
    expect(await lastAudit()).toEqual(
      expect.objectContaining({ outcome: 'FAILURE', clinicId: CLINIC_A })
    );
  });

  it('rejects keys with no FHIR scope', async () => {
    const res = await fhirGet(`/Patient/${p1}`, KEYS.noFhir);
    expect(res.status).toBe(403);
  });

  it('audits every request exactly once', async () => {
    await fhirGet('/metadata', null);
    await fhirGet(`/Patient/${p1}`);
    await fhirGet(`/Encounter?patient=${p1}`, KEYS.patientOnly);
    await new Promise((r) => setImmediate(r));
    expect((auditLog as jest.Mock).mock.calls.map(([e]) => [e.action, e.outcome])).toEqual([
      ['FHIR_ACCESS', 'SUCCESS'],
      ['FHIR_ACCESS', 'SUCCESS'],
      ['FHIR_ACCESS', 'FAILURE'],
    ]);
  });

  it('answers unsupported interactions with OperationOutcome', async () => {
    const res = await fhirGet('/Medication');
    expect(res.status).toBe(404);
    expect(res.body.issue[0].code).toBe('not-supported');
    expectValidFhir(res.body);
  });
});

describe('FHIR schema fixture', () => {
  it('actually rejects invalid resources', () => {
    expect(validateFhir({ resourceType: 'Patient', gender: 'robot' })).toBe(false);
    expect(
      validateFhir({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: { resourceType: 'Patient', id: 'has space' } }],
      })
    ).toBe(false);
  });
});
