#!/usr/bin/env node

/**
 * Generate OpenAPI specification from Zod schemas
 * 
 * This script scans route files and extracts Zod schemas to generate
 * an OpenAPI 3.0 specification document.
 */

const fs = require('fs');
const path = require('path');

// Placeholder OpenAPI spec - In a real implementation, this would:
// 1. Scan route files in src/routes/
// 2. Extract Zod schemas from request/response validators
// 3. Use a library like zod-to-openapi to convert schemas
// 4. Generate complete OpenAPI spec with all endpoints

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Health Watchers API',
    version: '1.0.0',
    description: 'Healthcare management platform API',
    contact: {
      name: 'Health Watchers Team',
      email: 'api@healthwatchers.example.com'
    }
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local development server'
    },
    {
      url: 'https://staging-api.healthwatchers.example.com',
      description: 'Staging server'
    },
    {
      url: 'https://api.healthwatchers.example.com',
      description: 'Production server'
    }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check endpoint',
        description: 'Returns the API health status',
        responses: {
          '200': {
            description: 'API is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'User login',
        description: 'Authenticate user and return tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 }
                }
              }
            }
          }
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
                        refreshToken: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/auth/refresh': {
      post: {
        summary: 'Refresh access token',
        description: 'Get a new access token using refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' }
                }
              }
            }
          }
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
                        refreshToken: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Invalid or expired refresh token'
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};

// Ensure output directory exists
const outputDir = path.join(__dirname, '..', 'docs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write OpenAPI spec
const outputPath = path.join(outputDir, 'openapi.json');
fs.writeFileSync(outputPath, JSON.stringify(openApiSpec, null, 2));

console.log(`✅ OpenAPI specification generated: ${outputPath}`);
console.log(`📄 Endpoints: ${Object.keys(openApiSpec.paths).length}`);
console.log(`\nTo extend this script:`);
console.log(`1. Install zod-to-openapi: npm install @asteasolutions/zod-to-openapi`);
console.log(`2. Scan route files and extract Zod schemas`);
console.log(`3. Convert Zod schemas to OpenAPI schema objects`);
console.log(`4. Build complete paths and operations`);
