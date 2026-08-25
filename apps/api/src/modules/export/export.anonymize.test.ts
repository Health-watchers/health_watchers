import { PassThrough } from 'stream';
import type { Response } from 'express';
import * as anonymizeLib from '@health-watchers/anonymize';
import { sendPatientJson, sendClinicZip } from './export.service';

jest.mock('@health-watchers/anonymize', () => {
  const actual = jest.requireActual('@health-watchers/anonymize');
  return {
    ...actual,
    anonymize: jest.fn(actual.anonymize),
    anonymizeBatch: jest.fn(actual.anonymizeBatch),
  };
});

function makeJsonRes(): Response & { setHeader: jest.Mock; json: jest.Mock } {
  const res: Record<string, unknown> = {};
  res.setHeader = jest.fn();
  res.json = jest.fn();
  return res as unknown as Response & { setHeader: jest.Mock; json: jest.Mock };
}

const BASE_PATIENT = {
  _id: 'p1',
  systemId: 'HW-000001',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-05-15',
  contactNumber: '555-1234',
  address: '123 Main St',
  clinicId: 'clinic1',
};

describe('export.service — anonymized JSON export (sendPatientJson)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exports raw (non-anonymized) data by default', () => {
    const res = makeJsonRes();
    sendPatientJson(res, { patient: BASE_PATIENT, encounters: [], payments: [] });

    expect(anonymizeLib.anonymize).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.anonymized).toBe(false);
    expect(payload.data.patient.firstName).toBe('Jane');
    expect(payload.data.patient.contactNumber).toBe('555-1234');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('HW-000001')
    );
  });

  it('anonymizes the patient at the requested level and flags the response', () => {
    const res = makeJsonRes();
    sendPatientJson(
      res,
      { patient: BASE_PATIENT, encounters: [], payments: [] },
      'de-identification'
    );

    expect(anonymizeLib.anonymize).toHaveBeenCalledWith(
      BASE_PATIENT,
      expect.objectContaining({ level: 'de-identification', purpose: 'export' })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.anonymized).toBe(true);
    expect(payload.data.patient.firstName).toBeUndefined();
    expect(payload.data.patient.contactNumber).toBe('[REDACTED]');
  });

  it('never leaks the real systemId in the filename once anonymization is requested', () => {
    const res = makeJsonRes();
    sendPatientJson(
      res,
      { patient: BASE_PATIENT, encounters: [], payments: [] },
      'pseudonymization'
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('patient-anonymized-export.json')
    );
    expect(res.setHeader).not.toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('HW-000001')
    );
  });

  it('strips internal/secret fields regardless of anonymization', () => {
    const res = makeJsonRes();
    const patientWithSecrets = { ...BASE_PATIENT, password: 'hashed', mfaSecret: 'totp-secret' };
    sendPatientJson(res, { patient: patientWithSecrets, encounters: [], payments: [] });

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.patient.password).toBeUndefined();
    expect(payload.data.patient.mfaSecret).toBeUndefined();
  });
});

describe('export.service — anonymized ZIP export (sendClinicZip)', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeZipRes(): Response & { setHeader: jest.Mock } {
    const stream = new PassThrough() as PassThrough & { setHeader?: jest.Mock };
    stream.setHeader = jest.fn();
    return stream as unknown as Response & { setHeader: jest.Mock };
  }

  it('does not anonymize when no level is requested', async () => {
    const res = makeZipRes();
    const record = { patients: [BASE_PATIENT], encounters: [], payments: [], staff: [] };

    const finished = new Promise((resolve) => res.on('finish', resolve).on('end', resolve));
    sendClinicZip(res, 'clinic1', record);
    res.resume();
    await Promise.race([finished, new Promise((r) => setTimeout(r, 500))]);

    expect(anonymizeLib.anonymizeBatch).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
  });

  it('anonymizes the patient batch at the requested level before archiving', async () => {
    const res = makeZipRes();
    const record = { patients: [BASE_PATIENT], encounters: [], payments: [], staff: [] };

    const finished = new Promise((resolve) => res.on('finish', resolve).on('end', resolve));
    sendClinicZip(res, 'clinic1', record, 'de-identification');
    res.resume();
    await Promise.race([finished, new Promise((r) => setTimeout(r, 500))]);

    expect(anonymizeLib.anonymizeBatch).toHaveBeenCalledWith(
      [BASE_PATIENT],
      expect.objectContaining({ level: 'de-identification', purpose: 'export' })
    );
  });

  it('does not crash building the CSV summary once dateOfBirth becomes an age-range string', async () => {
    // de-identification turns dateOfBirth into e.g. "45-49 years" — buildPatientCsv previously
    // re-parsed that with `new Date()` and threw RangeError: Invalid time value on .toISOString().
    const res = makeZipRes();
    const record = { patients: [BASE_PATIENT], encounters: [], payments: [], staff: [] };

    const errors: Error[] = [];
    res.on('error', (err: Error) => errors.push(err));
    const finished = new Promise((resolve) => res.on('finish', resolve).on('end', resolve));

    expect(() => sendClinicZip(res, 'clinic1', record, 'de-identification')).not.toThrow();
    res.resume();
    await Promise.race([finished, new Promise((r) => setTimeout(r, 500))]);

    expect(errors).toEqual([]);
  });
});
