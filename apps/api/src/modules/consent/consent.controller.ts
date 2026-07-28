import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { z } from 'zod';
import { ConsentModel, CONSENT_TEMPLATES, ConsentType } from './consent.model';
import { ConsentFormModel } from './consent-form.model';
import { auditLog } from '../audit/audit.service';
import { PatientModel } from '../patients/models/patient.model';
import { sendConsentVersionNotificationEmail } from '@api/lib/email.service';
import crypto from 'crypto';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN', 'NURSE', 'PATIENT');

const grantConsentSchema = z.object({
  type: z.enum(['treatment', 'data_sharing', 'ai_analysis', 'research', 'marketing']),
  expiresAt: z.string().optional(),
  signatureData: z.string(), // base64 string
});

// GET /consent/templates
router.get('/templates', (_req, res) => {
  res.json({ status: 'success', data: CONSENT_TEMPLATES });
});

// POST /patients/:id/consent
router.post(
  '/patients/:id/consent',
  WRITE_ROLES,
  validateRequest({ body: grantConsentSchema }),
  async (req: Request, res: Response) => {
   const { id: patientId } = req.params;
    const clinicId = req.user!.clinicId;
    const { type, expiresAt, signatureData } = req.body as { type: ConsentType; expiresAt?: string; signatureData: string };

    // Validate patientId is a legitimate ObjectId — prevents NoSQL injection via URL params
    if (!/^[a-f\d]{24}$/i.test(patientId)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid patient ID' });
    }
    const template = CONSENT_TEMPLATES[type];
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const signedAt = new Date();

    // Generate SHA-256 hash: content + patientId + timestamp
    const dataToHash = `${template.text}${patientId}${signedAt.toISOString()}`;
    const signatureHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    const consent = await ConsentModel.findOneAndUpdate(
      { patientId, clinicId, type },
      {
        status: 'granted',
        grantedAt: new Date(),
        withdrawnAt: undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        version: template.version,
        ipAddress,
        userAgent,
        signatureData,
        signedAt,
        signatureHash,
        grantedBy: req.user!.userId,
      },
      { upsert: true, new: true }
    );

    await auditLog(
      {
        action: 'PATIENT_UPDATE',
        resourceType: 'Consent',
        resourceId: String(consent._id),
        userId: req.user!.userId,
        clinicId,
        metadata: { event: 'consent_signed', type, patientId, signatureHash },
      },
      req
    );

    res.status(201).json({ status: 'success', data: consent });
  }
);

// POST /consent/:id/verify
router.post('/consent/:id/verify', async (req: Request, res: Response) => {
  const { id: consentId } = req.params;
  const clinicId = req.user!.clinicId;

  const consent = await ConsentModel.findById(consentId);

  if (!consent || consent.clinicId.toString() !== clinicId) {
    return res.status(404).json({ error: 'NotFound', message: 'Consent record not found' });
  }

  const template = CONSENT_TEMPLATES[consent.type];
  const dataToHash = `${template.text}${consent.patientId}${consent.signedAt!.toISOString()}`;
  const computedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

  const isValid = computedHash === consent.signatureHash;

  await auditLog(
    {
      action: 'VIEW',
      resourceType: 'Consent',
      resourceId: String(consent._id),
      userId: req.user!.userId,
      clinicId,
      metadata: { event: 'consent_verified', isValid, patientId: consent.patientId },
    },
    req
  );

  res.json({ status: 'success', data: { isValid } });
});

// GET /patients/:id/consent
router.get('/patients/:id/consent', async (req: Request, res: Response) => {
  const { id: patientId } = req.params;
  const clinicId = req.user!.clinicId;

  const consents = await ConsentModel.find({ patientId, clinicId }).lean();
  res.json({ status: 'success', data: consents });
});

// DELETE /patients/:id/consent/:type — withdraw consent
router.delete(
  '/patients/:id/consent/:type',
  WRITE_ROLES,
  async (req: Request, res: Response) => {
     const { id: patientId, type } = req.params;
    const clinicId = req.user!.clinicId;

    // Validate patientId is a legitimate ObjectId — prevents NoSQL injection via URL params
    if (!/^[a-f\d]{24}$/i.test(patientId)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid patient ID' });
    }

    const consent = await ConsentModel.findOneAndUpdate(
      { patientId, clinicId, type },
      { status: 'withdrawn', withdrawnAt: new Date() },
      { new: true }
    );

    if (!consent) {
      return res.status(404).json({ error: 'NotFound', message: 'Consent record not found' });
    }

    await auditLog(
      {
        action: 'PATIENT_UPDATE',
        resourceType: 'Consent',
        resourceId: String(consent._id),
        userId: req.user!.userId,
        clinicId,
        metadata: { event: 'consent_withdrawn', type, patientId },
      },
      req
    );

    res.json({ status: 'success', data: consent });
  }
);

// ── Consent versioning ────────────────────────────────────────────────────────

const ADMIN_ROLES = requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN');

const createFormVersionSchema = z.object({
  type: z.enum(['treatment', 'data_sharing', 'ai_analysis', 'research', 'marketing']),
  version: z.string().min(1),
  content: z.string().min(1),
  effectiveDate: z.string(),
});

const reConsentSchema = z.object({
  type: z.enum(['treatment', 'data_sharing', 'ai_analysis', 'research', 'marketing']),
  formVersionId: z.string(),
  signatureData: z.string(),
});

/**
 * POST /consent/forms — publish a new consent form version (CLINIC_ADMIN / SUPER_ADMIN)
 * Notifies all patients who have an existing consent of this type.
 */
router.post(
  '/forms',
  ADMIN_ROLES,
  validateRequest({ body: createFormVersionSchema }),
  async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const { type, version, content, effectiveDate } = req.body as z.infer<typeof createFormVersionSchema>;

    const form = await ConsentFormModel.create({
      clinicId,
      type,
      version,
      content,
      effectiveDate: new Date(effectiveDate),
      createdBy: req.user!.userId,
    });

    // Notify patients who already have an active consent of this type
    const existingConsents = await ConsentModel.find({
      clinicId,
      type,
      status: 'granted',
    }).lean();

    const patientIds = existingConsents.map((c) => c.patientId);
    if (patientIds.length > 0) {
      const patients = await PatientModel.find(
        { _id: { $in: patientIds }, email: { $exists: true, $ne: '' } },
        { email: 1, firstName: 1, lastName: 1 }
      ).lean();

      for (const patient of patients) {
        if (patient.email) {
          const name = `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim() || 'Patient';
          sendConsentVersionNotificationEmail(patient.email, name, type, version);
        }
      }
    }

    return res.status(201).json({ status: 'success', data: form });
  }
);

/**
 * GET /consent/current-version?type=treatment — get latest active consent form for this clinic
 */
router.get('/current-version', async (req: Request, res: Response) => {
  const clinicId = req.user!.clinicId;
  const { type } = req.query as { type?: string };

  if (!type) {
    return res.status(400).json({ error: 'BadRequest', message: 'type query param is required' });
  }

  const form = await ConsentFormModel.findOne({ clinicId, type })
    .sort({ effectiveDate: -1 })
    .lean();

  if (!form) {
    // Fall back to static template if no versioned form exists
    const template = CONSENT_TEMPLATES[type as ConsentType];
    if (!template) {
      return res.status(404).json({ error: 'NotFound', message: 'Consent form not found' });
    }
    return res.json({ status: 'success', data: { version: template.version, content: template.text, type } });
  }

  return res.json({ status: 'success', data: form });
});

/**
 * POST /consent/re-consent — patient accepts a new consent form version
 */
router.post(
  '/re-consent',
  validateRequest({ body: reConsentSchema }),
  async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const { type, formVersionId, signatureData } = req.body as z.infer<typeof reConsentSchema>;

    const form = await ConsentFormModel.findOne({ _id: formVersionId, clinicId, type }).lean();
    if (!form) {
      return res.status(404).json({ error: 'NotFound', message: 'Consent form version not found' });
    }

    // Derive patientId — PATIENT role users have patientId set on their JWT/user record
    // For staff recording on behalf of a patient, patientId comes from the body (not supported here — use existing grant endpoint)
    const patientIdFromUser = (req.user as { patientId?: string }).patientId;
    if (!patientIdFromUser) {
      return res.status(403).json({ error: 'Forbidden', message: 'Only patients may use re-consent' });
    }

    const signedAt = new Date();
    const dataToHash = `${form.content}${patientIdFromUser}${signedAt.toISOString()}`;
    const signatureHash = crypto.createHash('sha256').update(dataToHash).digest('hex');
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;

    const consent = await ConsentModel.findOneAndUpdate(
      { patientId: patientIdFromUser, clinicId, type },
      {
        status: 'granted',
        grantedAt: signedAt,
        withdrawnAt: undefined,
        version: form.version,
        formVersion: form._id,
        signatureData,
        signedAt,
        signatureHash,
        ipAddress,
        userAgent: req.headers['user-agent'],
        grantedBy: req.user!.userId,
      },
      { upsert: true, new: true }
    );

    await auditLog(
      {
        action: 'CONSENT_VERSION_ACCEPTED',
        resourceType: 'Consent',
        resourceId: String(consent._id),
        userId: req.user!.userId,
        clinicId,
        metadata: {
          event: 'consent_version_accepted',
          type,
          version: form.version,
          formVersionId,
          patientId: patientIdFromUser,
          signatureHash,
        },
      },
      req
    );

    return res.status(201).json({ status: 'success', data: consent });
  }
);

export const consentRoutes = router;

/**
 * Check if a patient has active consent for a given type.
 * Returns true if consent is granted and not expired.
 */
export async function hasConsent(
  patientId: string,
  clinicId: string,
  type: ConsentType
): Promise<boolean> {
  const consent = await ConsentModel.findOne({ patientId, clinicId, type }).lean();
  if (!consent || consent.status !== 'granted') return false;
  if (consent.expiresAt && consent.expiresAt < new Date()) return false;
  return true;
}
