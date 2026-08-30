import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize, Roles } from '../../middlewares/rbac.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import {
  createApiKey,
  listApiKeys,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyUsage,
  getApiKeyAnalytics,
} from './api-keys.controller';
import {
  createApiKeyBody,
  updateApiKeyBody,
  rotateApiKeyBody,
  revokeApiKeyBody,
} from './api-keys.schema';

const router = Router();

const adminOnly = [authenticate, authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN])];

router.post('/', ...adminOnly, validateRequest({ body: createApiKeyBody }), createApiKey);
router.get('/', ...adminOnly, listApiKeys);
router.patch('/:id', ...adminOnly, validateRequest({ body: updateApiKeyBody }), updateApiKey);
router.post('/:id/rotate', ...adminOnly, validateRequest({ body: rotateApiKeyBody }), rotateApiKey);
router.delete('/:id', ...adminOnly, validateRequest({ body: revokeApiKeyBody }), revokeApiKey);
router.get('/:id/usage', ...adminOnly, getApiKeyUsage);
router.get('/:id/analytics', ...adminOnly, getApiKeyAnalytics);

export default router;
