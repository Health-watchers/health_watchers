#!/usr/bin/env node

/**
 * Generate OpenAPI specification from Zod route schemas.
 *
 * This script scans the validation modules in src/modules, registers
 * their Zod schemas with @asteasolutions/zod-to-openapi, and writes
 * a complete OpenAPI 3.0 spec to apps/api/docs/openapi.json.
 *
 * CI regenerates this file and fails on any diff, ensuring the
 * committed spec always matches the live route schemas.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Load TypeScript modules via ts-node so we can import .ts validation files.
// ---------------------------------------------------------------------------
try {
  require('ts-node/register/transpile-only');
} catch {
  // ts-node may not be available in all environments; the require() below
  // will surface a clear error if the modules cannot be loaded.
}

// ---------------------------------------------------------------------------
// Import Zod schemas from validation modules.
// ---------------------------------------------------------------------------
function loadSchemaModule(relPath) {
  try {
    return require(path.join(__dirname, '..', relPath));
  } catch (err) {
    console.warn(`⚠️  Could not load ${relPath}: ${err.message}`);
    return null;
  }
}

const patientSchemas = loadSchemaModule('src/modules/patients/patients.validation');
const encounterSchemas = loadSchemaModule('src/modules/encounters/encounter.validation');
const appointmentSchemas = loadSchemaModule('src/modules/appointments/appointments.validation');
const paymentSchemas = loadSchemaModule('src/modules/payments/payments.validation');
const invoiceSchemas = loadSchemaModule('src/modules/invoices/invoices.validation');
const authSchemas = loadSchemaModule('src/modules/auth/auth.validation');

// ---------------------------------------------------------------------------
// Convert Zod schemas to OpenAPI schema objects using zod-to-openapi.
// ---------------------------------------------------------------------------
function zodToOpenApiSchema(zodSchema) {
  if (!zodSchema) return null;
  try {
    const { z } = require('zod');
    const { extendZodWithOpenApi, OpenAPIRegistry } = require('@asteasolutions/zod-to-openapi');
    extendZodWithOpenApi(z);
    const registry = new OpenAPIRegistry();
    const ref = registry.register('Temp', zodSchema);
    const generator = new (require('@asteasolutions/zod-to-openapi').OpenApiGeneratorV3)(
      registry.definitions
    );
    const components = generator.generateComponents();
    return components.components.schemas[ref.name] || null;
  } catch (err) {
    console.warn(`⚠️  Could not convert Zod schema to OpenAPI: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build component schemas from the loaded validation modules.
// ---------------------------------------------------------------------------
function buildComponentSchemas() {
  const schemas = {};

  const mappings = [
    { mod: patientSchemas, create: 'createPatientSchema', update: 'updatePatientSchema', name: 'Patient' },
    { mod: encounterSchemas, create: 'createEncounterSchema', update: 'updateEncounterSchema', name: 'Encounter' },
    { mod: appointmentSchemas, create: 'createAppointmentSchema', update: 'updateAppointmentSchema', name: 'Appointment' },
    { mod: paymentSchemas, create: 'createPaymentIntentSchema', update: null, name: 'PaymentIntent' },
    { mod: invoiceSchemas, create: 'createInvoiceSchema', update: null, name: 'Invoice' },
  ];

  for (const { mod, create, update, name } of mappings) {
    if (!mod) continue;

    if (create && mod[create]) {
      const openApi = zodToOpenApiSchema(mod[create]);
      if (openApi) schemas[`${name}Create`] = openApi;
    }

    if (update && mod[update]) {
      const openApi = zodToOpenApiSchema(mod[update]);
      if (openApi) schemas[`${name}Update`] = openApi;
    }
  }

  // Parameter schemas
  if (encounterSchemas) {
    const s = zodToOpenApiSchema(encounterSchemas.encounterIdParamSchema);
    if (s) schemas['EncounterIdParam'] = s;
    const s2 = zodToOpenApiSchema(encounterSchemas.patientIdParamSchema);
    if (s2) schemas['PatientIdParam'] = s2;
  }

  if (appointmentSchemas) {
    const s = zodToOpenApiSchema(appointmentSchemas.appointmentIdParamsSchema);
    if (s) schemas['AppointmentIdParam'] = s;
  }

  if (invoiceSchemas) {
    const s = zodToOpenApiSchema(invoiceSchemas.idParamSchema);
    if (s) schemas['InvoiceIdParam'] = s;
  }

  if (paymentSchemas) {
    const s = zodToOpenApiSchema(paymentSchemas.confirmPaymentParamsSchema);
    if (s) schemas['ConfirmPaymentParams'] = s;
  }

  return schemas;
}

// ---------------------------------------------------------------------------
// Standardised pagination schema.
// ---------------------------------------------------------------------------
const paginationMetaSchema = {
  type: 'object',
  description: 'Pagination metadata returned alongside every list endpoint response',
  required: ['total', 'page', 'limit', 'totalPages', 'hasNext', 'hasPrev'],
  properties: {
    total: { type: 'integer', minimum: 0, description: 'Total number of records matching the query', example: 42 },
    page: { type: 'integer', minimum: 1, description: 'Current page number (1-based)', example: 1 },
    limit: { type: 'integer', minimum: 1, description: 'Maximum number of records per page', example: 20 },
    totalPages: { type: 'integer', minimum: 0, description: 'Total number of pages available', example: 3 },
    hasNext: { type: 'boolean', description: 'Whether a next page exists', example: true },
    hasPrev: { type: 'boolean', description: 'Whether a previous page exists', example: false },
    nextCursor: { type: 'string', nullable: true, description: 'Opaque cursor for the next page', example: 'eyJpZCI6IjEyMyJ9' },
  },
};

const listItemSchemas = {
  Patient: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      dateOfBirth: { type: 'string', format: 'date' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Encounter: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      patientId: { type: 'string', format: 'uuid' },
      encounterDate: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Appointment: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      patientId: { type: 'string', format: 'uuid' },
      scheduledAt: { type: 'string', format: 'date-time' },
      status: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Payment: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      invoiceId: { type: 'string', format: 'uuid' },
      amount: { type: 'number' },
      status: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Invoice: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      patientId: { type: 'string', format: 'uuid' },
      total: { type: 'number' },
      status: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  LabResult: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      patientId: { type: 'string', format: 'uuid' },
      testName: { type: 'string' },
      resultDate: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Medication: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      patientId: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      dosage: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Referral: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      patientId: { type: 'string', format: 'uuid' },
      referredTo: { type: 'string' },
      status: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Notification: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      read: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
};

function buildPaginatedResponseSchema(itemSchemaRef) {
  return {
    type: 'object',
    description: 'Standardized paginated response envelope',
    required: ['data', 'pagination'],
    properties: {
      data: { type: 'array', items: itemSchemaRef },
      pagination: { $ref: '#/components/schemas/PaginationMeta' },
    },
  };
}

const paginationQueryParameters = [
  { name: 'page', in: 'query', required: false, description: 'Page number (1-based). Defaults to 1.', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', required: false, description: 'Max records per page. Defaults to 20, max 100.', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'sort', in: 'query', required: false, description: 'Field to sort by, prefix with "-" for descending.', schema: { type: 'string', example: '-createdAt' } },
  { name: 'cursor', in: 'query', required: false, description: 'Opaque cursor for cursor-based pagination.', schema: { type: 'string' } },
];

function buildListOperation(resourceName, itemSchemaName) {
  return {
    summary: `List ${resourceName}`,
    description: `Returns a paginated list of ${resourceName} using the standardized pagination envelope.`,
    parameters: paginationQueryParameters,
    responses: {
      '200': {
        description: `Paginated list of ${resourceName}`,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/Paginated${itemSchemaName}Response` },
          },
        },
      },
      '400': {
        description: 'Invalid pagination parameters',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Build the OpenAPI spec.
// ---------------------------------------------------------------------------
const componentSchemas = buildComponentSchemas();

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Health Watchers API',
    version: '1.0.0',
    description:
      'Healthcare management platform API. This spec is generated from Zod validation schemas — do not edit it by hand.',
    contact: { name: 'Health Watchers Team', email: 'api@healthwatchers.example.com' },
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Local development server' },
    { url: 'https://staging-api.healthwatchers.example.com', description: 'Staging server' },
    { url: 'https://api.healthwatchers.example.com', description: 'Production server' },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check endpoint',
        responses: {
          '200': {
            description: 'API is healthy',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'User login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        accessToken: { type: 'string' },
                        refreshToken: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { error: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
    '/api/v1/patients': {
      get: buildListOperation('patients', 'Patient'),
      post: {
        summary: 'Create a patient',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.PatientCreate
                ? { $ref: '#/components/schemas/PatientCreate' }
                : { type: 'object', required: ['firstName', 'lastName'], properties: { firstName: { type: 'string' }, lastName: { type: 'string' } } },
            },
          },
        },
        responses: {
          '201': { description: 'Patient created' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/patients/{id}': {
      patch: {
        summary: 'Update a patient',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.PatientUpdate
                ? { $ref: '#/components/schemas/PatientUpdate' }
                : { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Patient updated' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/encounters': {
      get: buildListOperation('encounters', 'Encounter'),
      post: {
        summary: 'Create an encounter',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.EncounterCreate
                ? { $ref: '#/components/schemas/EncounterCreate' }
                : { type: 'object', required: ['patientId'], properties: { patientId: { type: 'string' } } },
            },
          },
        },
        responses: {
          '201': { description: 'Encounter created' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/encounters/{id}': {
      patch: {
        summary: 'Update an encounter',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.EncounterUpdate
                ? { $ref: '#/components/schemas/EncounterUpdate' }
                : { type: 'object', properties: { notes: { type: 'string' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Encounter updated' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/appointments': {
      get: buildListOperation('appointments', 'Appointment'),
      post: {
        summary: 'Create an appointment',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.AppointmentCreate
                ? { $ref: '#/components/schemas/AppointmentCreate' }
                : { type: 'object', required: ['patientId', 'scheduledAt'], properties: { patientId: { type: 'string' }, scheduledAt: { type: 'string', format: 'date-time' } } },
            },
          },
        },
        responses: {
          '201': { description: 'Appointment created' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/appointments/{id}': {
      patch: {
        summary: 'Update an appointment',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.AppointmentUpdate
                ? { $ref: '#/components/schemas/AppointmentUpdate' }
                : { type: 'object', properties: { scheduledAt: { type: 'string', format: 'date-time' }, status: { type: 'string' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Appointment updated' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/payments': {
      get: buildListOperation('payments', 'Payment'),
      post: {
        summary: 'Create a payment',
        description: 'Supports idempotent retries via the `Idempotency-Key` header.',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            description: 'Client-generated unique key for idempotent retries.',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.PaymentIntentCreate
                ? { $ref: '#/components/schemas/PaymentIntentCreate' }
                : { type: 'object', required: ['amount', 'currency'], properties: { amount: { type: 'number' }, currency: { type: 'string' } } },
            },
          },
        },
        responses: {
          '201': { description: 'Payment created' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/payments/{id}': {
      patch: {
        summary: 'Update a payment',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.PaymentIntentUpdate
                ? { $ref: '#/components/schemas/PaymentIntentUpdate' }
                : { type: 'object', properties: { status: { type: 'string' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Payment updated' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/invoices': {
      get: buildListOperation('invoices', 'Invoice'),
      post: {
        summary: 'Create an invoice',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.InvoiceCreate
                ? { $ref: '#/components/schemas/InvoiceCreate' }
                : { type: 'object', required: ['patientId', 'amount'], properties: { patientId: { type: 'string' }, amount: { type: 'number' } } },
            },
          },
        },
        responses: {
          '201': { description: 'Invoice created' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/invoices/{id}': {
      patch: {
        summary: 'Update an invoice',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: componentSchemas.InvoiceUpdate
                ? { $ref: '#/components/schemas/InvoiceUpdate' }
                : { type: 'object', properties: { status: { type: 'string' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Invoice updated' },
          '400': {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
        },
      },
    },
    '/api/v1/webhooks/incoming': {
      post: {
        summary: 'Receive an inbound webhook',
        description: 'Requests must be signed with HMAC-SHA256; the signature is sent in the `X-Webhook-Signature` header.',
        parameters: [
          {
            name: 'X-Webhook-Signature',
            in: 'header',
            required: true,
            description: 'HMAC-SHA256 signature of the raw request body, hex encoded.',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        responses: {
          '200': { description: 'Webhook accepted' },
          '401': {
            description: 'Missing or invalid webhook signature',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { error: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
    '/api/v1/audit-logs': {
      get: {
        summary: 'List audit log entries',
        parameters: [
          { name: 'after', in: 'query', required: false, description: 'Return entries created after this cursor.', schema: { type: 'string' } },
          { name: 'before', in: 'query', required: false, description: 'Return entries created before this cursor.', schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: false, description: 'Maximum number of entries to return.', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          '200': {
            description: 'A page of audit log entries',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { type: 'object' } },
                    nextCursor: { type: 'string', nullable: true, description: 'Cursor to pass as `after` to fetch the next page.' },
                    prevCursor: { type: 'string', nullable: true, description: 'Cursor to pass as `before` to fetch the previous page.' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        summary: 'Refresh access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token refreshed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        accessToken: { type: 'string' },
                        refreshToken: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Invalid or expired refresh token' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    },
    schemas: {
      PaginationMeta: paginationMetaSchema,
      ValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'ValidationError' },
          code: { type: 'string', example: 'VALIDATION_ERROR' },
          message: { type: 'string', example: 'Invalid request body' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                message: { type: 'string' },
                code: { type: 'string' },
              },
            },
          },
          requestId: { type: 'string' },
        },
      },
      ...listItemSchemas,
      ...componentSchemas,
    },
  },
};

// Register paginated response wrappers for each list item schema
for (const [schemaName, schema] of Object.entries(listItemSchemas)) {
  openApiSpec.components.schemas[schemaName] = schema;
  openApiSpec.components.schemas[`Paginated${schemaName}Response`] = buildPaginatedResponseSchema({
    $ref: `#/components/schemas/${schemaName}`,
  });
}

// ---------------------------------------------------------------------------
// Write the spec.
// ---------------------------------------------------------------------------
const outputDir = path.join(__dirname, '..', 'docs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'openapi.json');
fs.writeFileSync(outputPath, JSON.stringify(openApiSpec, null, 2));

const endpointCount = Object.keys(openApiSpec.paths).length;
const schemaCount = Object.keys(openApiSpec.components.schemas).length;

console.log(`✅ OpenAPI specification generated: ${outputPath}`);
console.log(`📄 Endpoints: ${endpointCount}`);
console.log(`📦 Schemas: ${schemaCount}`);
