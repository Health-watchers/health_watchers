/**
 * CDN Route Group
 *
 * Handles cache management and CDN operations.
 *
 * Endpoints (mounted at /api/v1/cdn):
 *   POST   /cache-invalidation        — invalidate paths on one or all CDN providers
 *   POST   /cache-invalidation/bulk   — priority-queued bulk invalidation
 *   GET    /cache-status/:path        — check cache status for a path
 *   GET    /metrics                   — CDN performance metrics
 *
 * All endpoints require authentication; admin endpoints additionally require
 * the 'admin' role.
 */

import { Router } from 'express';
import cdnCacheRouter from './cache-invalidation';

export const cdnRouter = Router();

cdnRouter.use('/', cdnCacheRouter);
