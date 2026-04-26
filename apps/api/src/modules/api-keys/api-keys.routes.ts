import { Router } from 'express';
import { authorize, Roles } from '../../middlewares/rbac.middleware';
import { createApiKey, listApiKeys, revokeApiKey, getApiKeyUsage } from './api-keys.controller';

const router = Router();

// All routes require CLINIC_ADMIN
router.post('/', authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN]), createApiKey);
router.get('/', authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN]), listApiKeys);
router.delete('/:id', authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN]), revokeApiKey);
router.get('/:id/usage', authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN]), getApiKeyUsage);

export default router;
