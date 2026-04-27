import request from 'supertest';
import express from 'express';
import federationRouter from './federation.router';

// Mock ClinicModel
jest.mock('@api/modules/clinics/clinic.model', () => ({
  ClinicModel: {
    findOne: jest.fn(),
  },
}));

import { ClinicModel } from '@api/modules/clinics/clinic.model';

const app = express();
app.use('/.well-known', federationRouter);
app.use('/federation', federationRouter);

const mockFindOne = ClinicModel.findOne as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FEDERATION_DOMAIN = 'healthwatchers.com';
});

describe('GET /.well-known/stellar.toml', () => {
  it('returns TOML with FEDERATION_SERVER and NETWORK_PASSPHRASE', async () => {
    const res = await request(app).get('/.well-known/stellar.toml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('FEDERATION_SERVER=');
    expect(res.text).toContain('NETWORK_PASSPHRASE=');
    expect(res.text).toContain('[DOCUMENTATION]');
  });

  it('sets Access-Control-Allow-Origin: *', async () => {
    const res = await request(app).get('/.well-known/stellar.toml');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('GET /federation', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app).get('/federation?type=name');
    expect(res.status).toBe(400);
  });

  it('returns 400 when type is not name', async () => {
    const res = await request(app).get('/federation?q=lagos-general*healthwatchers.com&type=id');
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown domain', async () => {
    const res = await request(app).get('/federation?q=lagos-general*unknown.com&type=name');
    expect(res.status).toBe(404);
  });

  it('returns 404 when clinic not found', async () => {
    mockFindOne.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
    const res = await request(app).get('/federation?q=unknown-clinic*healthwatchers.com&type=name');
    expect(res.status).toBe(404);
  });

  it('returns correct public key for a known federation address', async () => {
    const mockClinic = {
      stellarPublicKey: 'GABC1234567890',
      federationAddress: 'lagos-general',
      name: 'Lagos General Hospital',
    };
    mockFindOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockClinic) }),
    });

    const res = await request(app).get(
      '/federation?q=lagos-general*healthwatchers.com&type=name'
    );

    expect(res.status).toBe(200);
    expect(res.body.stellar_address).toBe('lagos-general*healthwatchers.com');
    expect(res.body.account_id).toBe('GABC1234567890');
    expect(res.body.memo).toBe('Lagos General Hospital');
  });
});
