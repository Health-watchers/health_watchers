/**
 * Document management — search, access control, retention, audit, preview, OCR.
 * Issue #1247
 *
 * Mounted at /api/v1/documents alongside the existing upload/version controller.
 */
import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import logger from '@api/utils/logger';
import { DocumentModel } from './models/document.model';
import { DocumentAccessGrantModel } from './models/document-access-grant.model';
import { DocumentAuditModel } from './models/document-audit.model';
import { DocumentRetentionPolicyModel } from './models/document-retention-policy.model';
import { evaluateAccess, type AccessSubject, type AccessDecision } from './document-access.service';
import { searchDocuments } from './document-search.service';
import { assignRetention, runRetentionSweep } from './document-retention.service';
import { indexDocument } from './document-ocr.service';
import { generatePreview } from './document-preview.service';
import { recordDocumentAudit } from './document-audit.service';
import { getDownloadUrl } from './storage.service';
import {
  idParamSchema,
  grantParamSchema,
  searchQuerySchema,
  createGrantSchema,
  assignRetentionSchema,
  createPolicySchema,
  updateMetadataSchema,
} from './documents-management.validation';

const router = Router();
router.use(authenticate);

const MANAGER_ROLES = ['CLINIC_ADMIN', 'SUPER_ADMIN'] as const;

const subjectOf = (req: Request): AccessSubject => ({
  userId: req.user!.userId,
  role: req.user!.role as string,
  clinicId: req.user!.clinicId,
});
const fail = (res: Response, status: number, error: string, message: string): Response =>
  res.status(status).json({ error, message });

// ── Search (must precede /:id) ─────────────────────────────────────────────

router.get(
  '/search',
  validateRequest({ query: searchQuerySchema }),
  async (req: Request, res: Response) => {
    const q = req.query as Record<string, string>;
    const out = await searchDocuments({
      clinicId: req.user!.clinicId,
      userId: req.user!.userId,
      role: req.user!.role as string,
      q: q.q,
      tags: q.tags
        ? q.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
      documentType: q.documentType,
      patientId: q.patientId,
      includeExpired: q.includeExpired === 'true',
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    return res.json({ status: 'success', ...out });
  }
);

// ── Retention policies (must precede /:id) ─────────────────────────────────

router.get(
  '/retention-policies',
  requireRoles(...MANAGER_ROLES),
  async (req: Request, res: Response) => {
    const policies = await DocumentRetentionPolicyModel.find({
      clinicId: new Types.ObjectId(req.user!.clinicId),
    })
      .sort({ name: 1 })
      .lean();
    return res.json({ status: 'success', data: policies });
  }
);

router.post(
  '/retention-policies',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: createPolicySchema }),
  async (req: Request, res: Response) => {
    try {
      const doc = await DocumentRetentionPolicyModel.create({
        ...req.body,
        clinicId: new Types.ObjectId(req.user!.clinicId),
        createdBy: new Types.ObjectId(req.user!.userId),
      });
      return res.status(201).json({ status: 'success', data: doc });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return fail(res, 409, 'Conflict', 'A policy with that name already exists.');
      }
      return fail(res, 500, 'InternalError', (err as Error).message);
    }
  }
);

router.post(
  '/retention/sweep',
  requireRoles(...MANAGER_ROLES),
  async (_req: Request, res: Response) => {
    const result = await runRetentionSweep();
    return res.json({ status: 'success', data: result });
  }
);

// ── Single document metadata (access enforced) ────────────────────────────

async function loadAndAuthorize(
  req: Request,
  res: Response,
  permission: 'read' | 'write'
): Promise<{ doc: Record<string, unknown>; decision: AccessDecision } | null> {
  if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
    fail(res, 400, 'BadRequest', 'Invalid document id.');
    return null;
  }
  const doc = await DocumentModel.findById(new Types.ObjectId(req.params.id)).lean();
  if (!doc) {
    fail(res, 404, 'NotFound', 'Document not found.');
    return null;
  }
  const decision = await evaluateAccess(subjectOf(req), doc as never, permission);
  if (!decision.allowed) {
    await recordDocumentAudit({
      documentId: req.params.id,
      clinicId: req.user!.clinicId,
      actorId: req.user!.userId,
      action: 'access_denied',
      outcome: 'denied',
      req,
      metadata: { permission, reason: decision.reason },
    });
    fail(res, 403, 'Forbidden', decision.reason);
    return null;
  }
  return { doc: doc as Record<string, unknown>, decision };
}

router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    const loaded = await loadAndAuthorize(req, res, 'read');
    if (!loaded) return;
    await recordDocumentAudit({
      documentId: req.params.id,
      clinicId: req.user!.clinicId,
      actorId: req.user!.userId,
      action: 'view_metadata',
      req,
      metadata: { via: loaded.decision.via },
    });
    const { ocrText, ...safe } = loaded.doc as Record<string, unknown>;
    return res.json({ status: 'success', data: { ...safe, hasExtractedText: Boolean(ocrText) } });
  }
);

router.patch(
  '/:id/metadata',
  validateRequest({ params: idParamSchema, body: updateMetadataSchema }),
  async (req: Request, res: Response) => {
    const loaded = await loadAndAuthorize(req, res, 'write');
    if (!loaded) return;
    const updated = await DocumentModel.findByIdAndUpdate(
      new Types.ObjectId(req.params.id),
      { $set: req.body },
      { new: true }
    ).lean();
    return res.json({ status: 'success', data: updated });
  }
);

// ── Audit trail ───────────────────────────────────────────────────────────

router.get(
  '/:id/audit',
  validateRequest({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    const loaded = await loadAndAuthorize(req, res, 'read');
    if (!loaded) return;
    const entries = await DocumentAuditModel.find({
      documentId: new Types.ObjectId(req.params.id),
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.json({ status: 'success', data: entries });
  }
);

// ── Access grants ─────────────────────────────────────────────────────────

router.get(
  '/:id/grants',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    const grants = await DocumentAccessGrantModel.find({
      documentId: new Types.ObjectId(req.params.id),
      clinicId: new Types.ObjectId(req.user!.clinicId),
    })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ status: 'success', data: grants });
  }
);

router.post(
  '/:id/grants',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ params: idParamSchema, body: createGrantSchema }),
  async (req: Request, res: Response) => {
    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(req.params.id),
      clinicId: new Types.ObjectId(req.user!.clinicId),
    }).lean();
    if (!doc) return fail(res, 404, 'NotFound', 'Document not found.');

    const grant = await DocumentAccessGrantModel.create({
      documentId: doc._id,
      clinicId: doc.clinicId,
      userId: new Types.ObjectId(req.body.userId),
      permission: req.body.permission ?? 'read',
      grantedBy: new Types.ObjectId(req.user!.userId),
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      reason: req.body.reason,
    });

    await recordDocumentAudit({
      documentId: String(doc._id),
      clinicId: String(doc.clinicId),
      actorId: req.user!.userId,
      action: 'grant_created',
      req,
      metadata: { userId: req.body.userId, permission: grant.permission },
    });
    return res.status(201).json({ status: 'success', data: grant });
  }
);

router.delete(
  '/:id/grants/:grantId',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ params: grantParamSchema }),
  async (req: Request, res: Response) => {
    const grant = await DocumentAccessGrantModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(req.params.grantId),
        documentId: new Types.ObjectId(req.params.id),
        clinicId: new Types.ObjectId(req.user!.clinicId),
        revokedAt: { $exists: false },
      },
      { revokedAt: new Date(), revokedBy: new Types.ObjectId(req.user!.userId) },
      { new: true }
    ).lean();
    if (!grant) return fail(res, 404, 'NotFound', 'Active grant not found.');

    await recordDocumentAudit({
      documentId: req.params.id,
      clinicId: req.user!.clinicId,
      actorId: req.user!.userId,
      action: 'grant_revoked',
      req,
      metadata: { grantId: req.params.grantId },
    });
    return res.json({ status: 'success', data: grant });
  }
);

// ── Retention assignment for a single document ────────────────────────────

router.post(
  '/:id/retention',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ params: idParamSchema, body: assignRetentionSchema }),
  async (req: Request, res: Response) => {
    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(req.params.id),
      clinicId: new Types.ObjectId(req.user!.clinicId),
    }).lean();
    if (!doc) return fail(res, 404, 'NotFound', 'Document not found.');

    let retentionDays = req.body.retentionDays as number | undefined;
    if (retentionDays == null && req.body.policyId) {
      const policy = await DocumentRetentionPolicyModel.findOne({
        _id: new Types.ObjectId(req.body.policyId),
        clinicId: new Types.ObjectId(req.user!.clinicId),
      }).lean();
      if (!policy) return fail(res, 404, 'NotFound', 'Retention policy not found.');
      retentionDays = policy.retentionDays;
    }

    const out = await assignRetention({
      documentId: req.params.id,
      clinicId: req.user!.clinicId,
      documentType: doc.documentType,
      uploadedAt: (doc as { createdAt?: Date }).createdAt,
      explicitRetentionDays: retentionDays,
      actorId: req.user!.userId,
    });
    return res.json({ status: 'success', data: out });
  }
);

// ── Preview ───────────────────────────────────────────────────────────────

router.get(
  '/:id/preview',
  validateRequest({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    const loaded = await loadAndAuthorize(req, res, 'read');
    if (!loaded) return;
    const doc = loaded.doc;

    if (!doc.previewStorageKey) {
      try {
        await generatePreview(req.params.id);
      } catch (err) {
        logger.warn({ err, id: req.params.id }, 'on-demand preview generation failed');
      }
    }

    const fresh = await DocumentModel.findById(new Types.ObjectId(req.params.id))
      .select('previewStorageKey previewStatus')
      .lean();

    if (!fresh?.previewStorageKey) {
      return res.json({
        status: 'success',
        data: { available: false, previewStatus: fresh?.previewStatus ?? 'unsupported' },
      });
    }

    const url = await getDownloadUrl(fresh.previewStorageKey);
    await recordDocumentAudit({
      documentId: req.params.id,
      clinicId: req.user!.clinicId,
      actorId: req.user!.userId,
      action: 'preview',
      req,
    });
    return res.json({
      status: 'success',
      data: { available: true, url, previewStatus: fresh.previewStatus },
    });
  }
);

// ── OCR re-index ──────────────────────────────────────────────────────────

router.post(
  '/:id/reindex',
  validateRequest({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    const loaded = await loadAndAuthorize(req, res, 'write');
    if (!loaded) return;
    // Fire and forget — status is observable via GET /:id.
    void indexDocument(req.params.id).catch((err) =>
      logger.error({ err, id: req.params.id }, 'reindex failed')
    );
    return res.status(202).json({ status: 'accepted', data: { ocrStatus: 'processing' } });
  }
);

export const documentManagementRoutes = router;
