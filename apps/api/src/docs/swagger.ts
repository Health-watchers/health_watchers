import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Health Watchers API',
      version: '1.0.0',
      description:
        'HIPAA-compliant healthcare management platform API with Stellar blockchain payment integration.',
    },
    servers: [{ url: '/api/v1', description: 'API v1' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        TimelineEvent: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            type: { type: 'string', enum: ['encounter', 'lab_result', 'immunization', 'prescription', 'appointment'] },
            date: { type: 'string', format: 'date-time' },
            title: { type: 'string', example: 'Consultation — Headache' },
            description: { type: 'string', example: 'Patient reports recurring headaches' },
            details: { type: 'object' },
            clinicId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 42 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            totalPages: { type: 'integer', example: 3 },
            hasNextPage: { type: 'boolean', example: true },
            hasPrevPage: { type: 'boolean', example: false },
            nextCursor: { type: 'string', nullable: true, example: null },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'BadRequest' },
            message: { type: 'string', example: 'Validation failed' },
          },
        },
        PaymentRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            intentId: { type: 'string', format: 'uuid' },
            amount: { type: 'string', example: '10.0000000' },
            destination: { type: 'string', example: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB' },
            memo: { type: 'string', example: 'HW:A1B2C3D4' },
            assetCode: { type: 'string', example: 'XLM', enum: ['XLM', 'USDC'] },
            assetIssuer: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['pending', 'confirmed', 'failed', 'expired'] },
            txHash: { type: 'string', nullable: true },
            clinicId: { type: 'string' },
            patientId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            confirmedAt: { type: 'string', format: 'date-time', nullable: true },
            claimableBalanceId: { type: 'string', nullable: true },
            claimableAfter: { type: 'string', format: 'date-time', nullable: true },
            claimableUntil: { type: 'string', format: 'date-time', nullable: true },
            claimed: { type: 'boolean', nullable: true },
            claimableExpiryNotificationSent: { type: 'boolean', default: false },
          },
        },
        CreatePaymentIntentRequest: {
          type: 'object',
          required: ['amount', 'destination'],
          properties: {
            amount: { type: 'string', example: '10.0000000', description: 'Payment amount as string' },
            destination: { type: 'string', example: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB', description: 'Stellar destination public key' },
            patientId: { type: 'string', description: 'MongoDB ObjectId of the patient' },
            assetCode: { type: 'string', default: 'XLM', enum: ['XLM', 'USDC'], description: 'Asset code (alias: currency)' },
            currency: { type: 'string', description: 'Alias for assetCode' },
            issuer: { type: 'string', description: 'Asset issuer address (required for non-XLM assets)' },
            memo: { type: 'string', description: 'Custom memo (auto-generated if omitted)' },
            sourceAssetCode: { type: 'string', description: 'Source asset for path payments' },
            sourceAssetIssuer: { type: 'string', description: 'Source asset issuer for path payments' },
            destinationAmount: { type: 'string', description: 'Exact destination amount for path payments' },
            maxSourceAmount: { type: 'string', description: 'Maximum source amount for path payments' },
            path: { type: 'array', items: { type: 'string' }, description: 'Intermediate assets for path payment' },
            feeStrategy: { type: 'string', enum: ['standard', 'high', 'low'], default: 'standard' },
            sponsorFee: { type: 'boolean', default: false, description: 'Whether the platform sponsors the transaction fee' },
          },
        },
        ConfirmPaymentRequest: {
          type: 'object',
          required: ['txHash'],
          properties: {
            txHash: { type: 'string', example: 'abc123...', description: 'Stellar transaction hash' },
          },
        },
        Insurance: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            provider: { type: 'string', example: 'Blue Cross Blue Shield' },
            policyNumber: { type: 'string', example: 'XYZ123456789' },
            groupNumber: { type: 'string', example: 'GRP-001', nullable: true },
            coverageType: {
              type: 'string',
              enum: ['HMO', 'PPO', 'EPO', 'POS', 'HDHP', 'Medicare', 'Medicaid', 'other'],
              example: 'PPO',
            },
            effectiveDate: { type: 'string', format: 'date', example: '2024-01-01', nullable: true },
            expirationDate: { type: 'string', format: 'date', example: '2024-12-31', nullable: true },
            isPrimary: { type: 'boolean', example: true },
          },
        },
        CreateInsurance: {
          type: 'object',
          required: ['provider', 'policyNumber', 'coverageType'],
          properties: {
            provider: { type: 'string', example: 'Blue Cross Blue Shield' },
            policyNumber: { type: 'string', example: 'XYZ123456789' },
            groupNumber: { type: 'string', example: 'GRP-001' },
            coverageType: {
              type: 'string',
              enum: ['HMO', 'PPO', 'EPO', 'POS', 'HDHP', 'Medicare', 'Medicaid', 'other'],
            },
            effectiveDate: { type: 'string', format: 'date', example: '2024-01-01' },
            expirationDate: { type: 'string', format: 'date', example: '2024-12-31' },
            isPrimary: { type: 'boolean', default: false },
          },
        },
        UpdateInsurance: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            policyNumber: { type: 'string' },
            groupNumber: { type: 'string' },
            coverageType: {
              type: 'string',
              enum: ['HMO', 'PPO', 'EPO', 'POS', 'HDHP', 'Medicare', 'Medicaid', 'other'],
            },
            effectiveDate: { type: 'string', format: 'date' },
            expirationDate: { type: 'string', format: 'date' },
            isPrimary: { type: 'boolean' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    path.join(__dirname, '../modules/payments/payments.controller.ts'),
    path.join(__dirname, '../modules/payments/analytics.controller.ts'),
    path.join(__dirname, '../modules/payments/dispute.controller.ts'),
    path.join(__dirname, '../modules/payments/payments.export.controller.ts'),
    path.join(__dirname, '../modules/export/export.routes.ts'),
    path.join(__dirname, '../modules/portal/portal.controller.ts'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
