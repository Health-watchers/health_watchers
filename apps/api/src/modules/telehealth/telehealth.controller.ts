import { Router, Request, Response } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { authorize } from '@api/middlewares/rbac.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import * as sessionService from './telehealth-session.service';
import * as recordingService from './telehealth-recording.service';
import * as transcriptionService from './telehealth-transcription.service';
import * as chatService from './telehealth-chat.service';
import * as archiveService from './telehealth-archive.service';
import {
  sessionIdParamSchema,
  createSessionBodySchema,
  joinSessionBodySchema,
  listSessionsQuerySchema,
  captionsBodySchema,
  bandwidthBodySchema,
  cancelBodySchema,
  initRecordingBodySchema,
  consentBodySchema,
  transcriptionBodySchema,
  chatBodySchema,
  archiveListQuerySchema,
} from './telehealth.validation';

/**
 * /telehealth — video visit lifecycle (#1249).
 *
 *  POST   /telehealth/sessions                         Create a session + room
 *  GET    /telehealth/sessions                         List sessions
 *  GET    /telehealth/sessions/:id                     Session detail
 *  POST   /telehealth/sessions/:id/start               Mark active
 *  POST   /telehealth/sessions/:id/join                Issue access token + secure link
 *  POST   /telehealth/sessions/:id/end                 End the session
 *  POST   /telehealth/sessions/:id/cancel              Cancel a scheduled session
 *  PATCH  /telehealth/sessions/:id/captions            Toggle live captions
 *  PATCH  /telehealth/sessions/:id/bandwidth           Change bandwidth profile
 *  POST   /telehealth/sessions/:id/recording/init      Open recording consent
 *  POST   /telehealth/sessions/:id/recording/consent   Record a consent decision
 *  POST   /telehealth/sessions/:id/recording/start     Start recording (consent-gated)
 *  POST   /telehealth/sessions/:id/recording/stop      Stop recording
 *  GET    /telehealth/sessions/:id/recording           Recording + audit trail
 *  POST   /telehealth/sessions/:id/transcript          Create a transcript
 *  GET    /telehealth/sessions/:id/transcript          Latest transcript
 *  GET    /telehealth/sessions/:id/chat                Chat history
 *  POST   /telehealth/sessions/:id/chat                Post a chat message
 *  POST   /telehealth/sessions/:id/archive             Archive an ended session
 *  GET    /telehealth/sessions/:id/archive             Full session archive bundle
 *  GET    /telehealth/archive                          List archived sessions
 */
const router = Router();
router.use(authenticate);
router.use(authorize(['SUPER_ADMIN', 'CLINIC_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE']));

function actor(req: Request): sessionService.Actor {
  return { userId: req.user!.userId, clinicId: req.user!.clinicId };
}

// ── Sessions ────────────────────────────────────────────────────────────────
router.post(
  '/sessions',
  validateRequest({ body: createSessionBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const session = await sessionService.createSession(req.body, actor(req));
    return res.status(201).json({ status: 'success', data: session });
  })
);

router.get(
  '/sessions',
  validateRequest({ query: listSessionsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, status, providerId, patientId } = req.query as unknown as {
      page: number;
      limit: number;
      status?: sessionService.ListSessionsQuery['status'];
      providerId?: string;
      patientId?: string;
    };
    const result = await sessionService.listSessions(req.user!.clinicId, {
      page,
      limit,
      status,
      providerId,
      patientId,
    });
    return res.json({ status: 'success', data: result.data, pagination: result.meta });
  })
);

router.get(
  '/sessions/:id',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const session = await sessionService.getSession(req.params.id, req.user!.clinicId);
    if (!session) return res.status(404).json({ error: 'NotFound', message: 'Session not found' });
    return res.json({ status: 'success', data: session });
  })
);

router.post(
  '/sessions/:id/start',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const session = await sessionService.startSession(req.params.id, actor(req));
    return res.json({ status: 'success', data: session });
  })
);

router.post(
  '/sessions/:id/join',
  validateRequest({ params: sessionIdParamSchema, body: joinSessionBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await sessionService.joinSession(
      {
        sessionId: req.params.id,
        userId: req.user!.userId,
        identity: req.user!.userId,
        role: req.body.role,
        displayName: req.body.displayName,
        ttlSeconds: req.body.ttlSeconds,
      },
      actor(req)
    );
    return res.json({ status: 'success', data: result });
  })
);

router.post(
  '/sessions/:id/end',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const session = await sessionService.endSession(req.params.id, actor(req));
    return res.json({ status: 'success', data: session });
  })
);

router.post(
  '/sessions/:id/cancel',
  validateRequest({ params: sessionIdParamSchema, body: cancelBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const session = await sessionService.cancelSession(req.params.id, actor(req), req.body.reason);
    return res.json({ status: 'success', data: session });
  })
);

router.patch(
  '/sessions/:id/captions',
  validateRequest({ params: sessionIdParamSchema, body: captionsBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const session = await sessionService.setCaptions(req.params.id, req.body.enabled, actor(req));
    return res.json({ status: 'success', data: session });
  })
);

router.patch(
  '/sessions/:id/bandwidth',
  validateRequest({ params: sessionIdParamSchema, body: bandwidthBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await sessionService.updateBandwidthProfile(
      req.params.id,
      req.body.profile,
      actor(req)
    );
    return res.json({ status: 'success', data: result });
  })
);

// ── Recording ───────────────────────────────────────────────────────────────
router.post(
  '/sessions/:id/recording/init',
  validateRequest({ params: sessionIdParamSchema, body: initRecordingBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const recording = await recordingService.initRecording(
      req.params.id,
      actor(req),
      req.body.requiredConsentRoles
    );
    return res.status(201).json({ status: 'success', data: recording });
  })
);

router.post(
  '/sessions/:id/recording/consent',
  validateRequest({ params: sessionIdParamSchema, body: consentBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const recording = await recordingService.recordConsent(
      {
        sessionId: req.params.id,
        userId: req.user!.userId,
        role: req.body.role,
        consented: req.body.consented,
      },
      actor(req)
    );
    return res.json({ status: 'success', data: recording });
  })
);

router.post(
  '/sessions/:id/recording/start',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const recording = await recordingService.startRecording(req.params.id, actor(req));
      return res.json({ status: 'success', data: recording });
    } catch (err) {
      if ((err as Error).message.startsWith('Recording blocked')) {
        return res.status(409).json({ error: 'ConsentRequired', message: (err as Error).message });
      }
      throw err;
    }
  })
);

router.post(
  '/sessions/:id/recording/stop',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const recording = await recordingService.stopRecording(req.params.id, actor(req));
    return res.json({ status: 'success', data: recording });
  })
);

router.get(
  '/sessions/:id/recording',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const recording = await recordingService.getRecording(req.params.id, req.user!.clinicId);
    if (!recording) {
      return res.status(404).json({ error: 'NotFound', message: 'No recording for this session' });
    }
    return res.json({ status: 'success', data: recording });
  })
);

// ── Transcription ───────────────────────────────────────────────────────────
router.post(
  '/sessions/:id/transcript',
  validateRequest({ params: sessionIdParamSchema, body: transcriptionBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const transcript = await transcriptionService.createTranscription(
      { sessionId: req.params.id, recordingId: req.body.recordingId, language: req.body.language },
      actor(req)
    );
    return res.status(201).json({ status: 'success', data: transcript });
  })
);

router.get(
  '/sessions/:id/transcript',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const transcript = await transcriptionService.getTranscript(req.params.id, req.user!.clinicId);
    if (!transcript) {
      return res.status(404).json({ error: 'NotFound', message: 'No transcript for this session' });
    }
    return res.json({ status: 'success', data: transcript });
  })
);

// ── Chat ────────────────────────────────────────────────────────────────────
router.get(
  '/sessions/:id/chat',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const messages = await chatService.listMessages(req.params.id, req.user!.clinicId);
    return res.json({ status: 'success', data: messages });
  })
);

router.post(
  '/sessions/:id/chat',
  validateRequest({ params: sessionIdParamSchema, body: chatBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const message = await chatService.postMessage(
      {
        sessionId: req.params.id,
        senderId: req.user!.userId,
        senderRole: req.body.senderRole,
        senderName: req.body.senderName,
        message: req.body.message,
      },
      actor(req)
    );
    return res.status(201).json({ status: 'success', data: message });
  })
);

// ── Archive ─────────────────────────────────────────────────────────────────
router.post(
  '/sessions/:id/archive',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const session = await archiveService.archiveSession(req.params.id, actor(req));
    return res.json({ status: 'success', data: session });
  })
);

router.get(
  '/sessions/:id/archive',
  validateRequest({ params: sessionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const bundle = await archiveService.getSessionArchive(req.params.id, req.user!.clinicId);
    if (!bundle) return res.status(404).json({ error: 'NotFound', message: 'Session not found' });
    return res.json({ status: 'success', data: bundle });
  })
);

router.get(
  '/archive',
  validateRequest({ query: archiveListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const result = await archiveService.listArchivedSessions(req.user!.clinicId, page, limit);
    return res.json({ status: 'success', data: result.data, pagination: result.meta });
  })
);

export const telehealthRoutes = router;
