import { Router, RequestHandler } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import {
  createApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  getApiKeyUsage,
  getAvailableScopes,
} from './api-key.controller';
import { createApiKeySchema, updateApiKeySchema, listApiKeysSchema } from './api-key.validation';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get available scopes (public endpoint)
router.get('/scopes', getAvailableScopes);

// Create a new API key
router.post(
  '/',
  validateRequest({ body: createApiKeySchema.shape.body }),
  createApiKey as RequestHandler
);

// List API keys
router.get(
  '/',
  validateRequest({ query: listApiKeysSchema.shape.query }),
  listApiKeys as RequestHandler
);

// Get a specific API key
router.get('/:id', getApiKey as RequestHandler);

// Update an API key
router.patch(
  '/:id',
  validateRequest({ body: updateApiKeySchema.shape.body }),
  updateApiKey as RequestHandler
);

// Revoke an API key
router.delete('/:id', revokeApiKey as RequestHandler);

// Get usage logs for an API key
router.get('/:id/usage', getApiKeyUsage as RequestHandler);

export default router;
