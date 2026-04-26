import { Router, Request, Response } from 'express';
import { ClinicModel } from '@api/modules/clinics/clinic.model';

const router = Router();

const DOMAIN = process.env.FEDERATION_DOMAIN || 'healthwatchers.com';
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const PLATFORM_PUBLIC_KEY = process.env.STELLAR_PLATFORM_PUBLIC_KEY || '';
const API_URL = process.env.API_URL || 'http://localhost:3001';

const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

// GET /.well-known/stellar.toml
router.get('/stellar.toml', async (_req: Request, res: Response) => {
  const accounts = PLATFORM_PUBLIC_KEY ? `ACCOUNTS=["${PLATFORM_PUBLIC_KEY}"]` : '';

  const toml = [
    `NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE}"`,
    `FEDERATION_SERVER="${API_URL}/federation"`,
    accounts,
    '',
    '[DOCUMENTATION]',
    `ORG_NAME="Health Watchers"`,
    `ORG_URL="https://${DOMAIN}"`,
    `ORG_DESCRIPTION="HIPAA-compliant healthcare management platform"`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.send(toml);
});

// GET /federation?q={address}&type=name
router.get('/', async (req: Request, res: Response) => {
  const { q, type } = req.query as { q?: string; type?: string };

  if (!q || type !== 'name') {
    return res.status(400).json({ detail: 'q and type=name are required' });
  }

  // Parse address: slug*domain
  const parts = q.split('*');
  if (parts.length !== 2 || parts[1] !== DOMAIN) {
    return res.status(404).json({ detail: 'Not found' });
  }

  const slug = parts[0].toLowerCase();

  const clinic = await ClinicModel.findOne({ federationAddress: slug, isActive: true })
    .select('stellarPublicKey federationAddress name')
    .lean();

  if (!clinic || !clinic.stellarPublicKey) {
    return res.status(404).json({ detail: 'Not found' });
  }

  return res.json({
    stellar_address: `${slug}*${DOMAIN}`,
    account_id: clinic.stellarPublicKey,
    memo_type: 'text',
    memo: clinic.name,
  });
});

export default router;
