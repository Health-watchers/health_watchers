import dotenv from 'dotenv';
import path from 'path';
import { validateStartupSecrets, logSecretsStatus } from './secrets-validator';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

validateStartupSecrets();

const network = process.env.STELLAR_NETWORK || 'testnet';
const horizonUrl =
  network === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

export const config = {
  // Server Configuration
  apiPort: process.env.API_PORT || '3001',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database Configuration
  mongoUri: process.env.MONGO_URI || '',

  // JWT Authentication
  jwt: {
    accessTokenSecret: process.env.JWT_ACCESS_TOKEN_SECRET || '',
    refreshTokenSecret: process.env.JWT_REFRESH_TOKEN_SECRET || '',
    issuer: process.env.JWT_ISSUER || 'health-watchers-api',
    audience: process.env.JWT_AUDIENCE || 'health-watchers-client',
  },

  // Blockchain Configuration (flat aliases kept for backward compat)
  stellarNetwork: network,
  stellarHorizonUrl: horizonUrl,
  stellarSecretKey: process.env.STELLAR_SECRET_KEY || '',
  stellar: {
    network,
    horizonUrl,
    secretKey: process.env.STELLAR_SECRET_KEY || '',
    platformPublicKey: process.env.STELLAR_PLATFORM_PUBLIC_KEY || '',
    usdcIssuer:
      network === 'mainnet'
        ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
        : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },

  // Payment Assets
  // Comma-separated list of supported asset codes. XLM (native) is always included.
  // Format: "XLM,USDC,EURC"
  supportedAssets: (process.env.SUPPORTED_ASSETS || 'XLM')
    .split(',')
    .map((a) => a.trim().toUpperCase())
    .filter(Boolean),

  // Stellar Service (microservice for blockchain operations)
  stellarServiceUrl: process.env.STELLAR_SERVICE_URL || 'http://localhost:3002',

  // AI/LLM Configuration
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // PHI Field-Level Encryption
  fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY || '',

  // Email Configuration
  email: {
    provider: (process.env.EMAIL_PROVIDER || 'smtp') as 'smtp' | 'sendgrid',
    from: process.env.EMAIL_FROM || 'noreply@healthwatchers.com',
    smtp: {
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  },
};

if (['development', 'staging'].includes(process.env.NODE_ENV || 'development')) {
  logSecretsStatus();
}
