import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize, Roles } from '../../middlewares/rbac.middleware';
import {
  createApiKey,
  listApiKeys,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyUsage,
} from './api-keys.controller';

const router = Router();

const adminOnly = [authenticate, authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN])];

router.post('/', ...adminOnly, createApiKey);
router.get('/', ...adminOnly, listApiKeys);
router.patch('/:id', ...adminOnly, updateApiKey);
router.post('/:id/rotate', ...adminOnly, rotateApiKey);
router.delete('/:id', ...adminOnly, revokeApiKey);
router.get('/:id/usage', ...adminOnly, getApiKeyUsage);

export default router;
