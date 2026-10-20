import { Router, Request, Response } from 'express';
import { Types, PipelineStage } from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { escapeRegex } from '@api/utils/regex';
import { sendMail } from '@api/utils/mailer';
import { emitToClinic, emitToUser } from '@api/realtime/socket';
import { PortalMessageModel } from '../portal/models/portal-message.model';
import { PatientModel } from '../patients/models/patient.model';
import { UserModel } from '../auth/models/user.model';
import { createNotification } from '../notifications/notification.service';
import { InboxThreadModel } from './inbox-thread.model';

/**
 * Care Team Inbox (#1418) — clinician-side view of patient portal message threads.
 *
 * Real-time events (all emitted to the `clinic:<id>` room):
 *   portal:message:new     — a patient or staff message was posted (emitted by portal/patients too)
 *   inbox:thread:updated   — assignment / priority / status changed
 *   inbox:unread:changed   — a thread was marked read, so unread badges must refresh
 */
export const inboxRoutes = Router();

const STAFF_ROLES = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT'] as const;

inboxRoutes.use(authenticate);
inboxRoutes.use(requireRoles(...STAFF_ROLES));

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id');

const threadParamSchema = z.object({ threadId: objectId });

const listQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'all']).optional(),
  assignee: z.union([z.enum(['me', 'unassigned', 'all']), objectId]).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  unread: z.enum(['true', 'false']).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const patchThreadSchema = z
  .object({
    assigneeId: objectId.nullable().optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    status: z.enum(['open', 'closed']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const replySchema = z.object({
  body: z.string().trim().min(1).max(5000),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1),
        url: z.string().url(),
        mimeType: z.string().optional(),
        size: z.number().optional(),
      })
    )
    .max(10)
    .optional(),
});

const UNREAD_EXPR = {
  $cond: [
    {
      $and: [
        { $eq: ['$direction', 'patient_to_staff'] },
        { $eq: [{ $ifNull: ['$readAt', null] }, null] },
      ],
    },
    1,
    0,
  ],
};

function patientName(p: any): string {
  return `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Patient';
}

async function loadThreadMeta(clinicId: string, threadId: string) {
  return InboxThreadModel.findOne({
    clinicId: new Types.ObjectId(clinicId),
    threadId: new Types.ObjectId(threadId),
  })
    .populate('assigneeId', 'fullName role')
    .lean();
}

function serializeMeta(meta: any) {
  return {
    status: meta?.status ?? 'open',
    priority: meta?.priority ?? 'normal',
    assignee: meta?.assigneeId
      ? {
          id: String(meta.assigneeId._id ?? meta.assigneeId),
          fullName: meta.assigneeId.fullName ?? null,
        }
      : null,
    closedAt: meta?.closedAt ?? null,
  };
}

// GET /api/v1/inbox/threads — thread list for the left pane
inboxRoutes.get(
  '/threads',
  validateRequest({ query: listQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      status = 'open',
      assignee = 'all',
      priority,
      unread,
      q,
    } = req.query as z.infer<typeof listQuerySchema>;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 30);
    const clinicId = new Types.ObjectId(req.user!.clinicId);

    const messageMatch: Record<string, unknown> = { clinicId };
    if (q) {
      const safe = escapeRegex(q);
      const matchingThreads = await PortalMessageModel.distinct('threadId', {
        clinicId,
        $or: [
          { subject: { $regex: safe, $options: 'i' } },
          { body: { $regex: safe, $options: 'i' } },
        ],
      });
      // Also match by patient name
      const patients = await PatientModel.find(
        {
          clinicId,
          $or: [
            { firstName: { $regex: safe, $options: 'i' } },
            { lastName: { $regex: safe, $options: 'i' } },
          ],
        },
        { _id: 1 }
      ).lean();
      messageMatch.$or = [
        { threadId: { $in: matchingThreads } },
        { patientId: { $in: patients.map((p) => p._id) } },
      ];
    }

    const metaMatch: Record<string, unknown> = {};
    if (status !== 'all') metaMatch.status = status;
    if (priority) metaMatch.priority = priority;
    if (assignee === 'me') metaMatch.assigneeId = new Types.ObjectId(req.user!.userId);
    else if (assignee === 'unassigned') metaMatch.assigneeId = null;
    else if (assignee !== 'all') metaMatch.assigneeId = new Types.ObjectId(assignee);
    if (unread === 'true') metaMatch.unreadCount = { $gt: 0 };

    const pipeline: PipelineStage[] = [
      { $match: messageMatch },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$threadId',
          patientId: { $first: '$patientId' },
          subject: { $last: '$subject' }, // earliest message's subject names the thread
          lastBody: { $first: '$body' },
          lastDirection: { $first: '$direction' },
          lastMessageAt: { $first: '$createdAt' },
          messageCount: { $sum: 1 },
          unreadCount: { $sum: UNREAD_EXPR },
          hasAttachments: {
            $max: { $gt: [{ $size: { $ifNull: ['$attachments', []] } }, 0] },
          },
        },
      },
      {
        $lookup: {
          from: 'inboxthreads',
          let: { tid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$threadId', '$$tid'] }, { $eq: ['$clinicId', clinicId] }],
                },
              },
            },
          ],
          as: 'meta',
        },
      },
      { $set: { meta: { $arrayElemAt: ['$meta', 0] } } },
      {
        $set: {
          status: { $ifNull: ['$meta.status', 'open'] },
          priority: { $ifNull: ['$meta.priority', 'normal'] },
          assigneeId: { $ifNull: ['$meta.assigneeId', null] },
        },
      },
      { $match: metaMatch },
      { $sort: { lastMessageAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: 'patients',
                localField: 'patientId',
                foreignField: '_id',
                as: 'patient',
                pipeline: [{ $project: { firstName: 1, lastName: 1, systemId: 1 } }],
              },
            },
            {
              $lookup: {
                from: 'users',
                localField: 'assigneeId',
                foreignField: '_id',
                as: 'assignee',
                pipeline: [{ $project: { fullName: 1, role: 1 } }],
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await PortalMessageModel.aggregate(pipeline);
    const total = result?.total?.[0]?.count ?? 0;

    const data = (result?.data ?? []).map((t: any) => ({
      threadId: String(t._id),
      subject: t.subject,
      preview: String(t.lastBody ?? '').slice(0, 160),
      lastDirection: t.lastDirection,
      lastMessageAt: t.lastMessageAt,
      messageCount: t.messageCount,
      unreadCount: t.unreadCount,
      hasAttachments: Boolean(t.hasAttachments),
      status: t.status,
      priority: t.priority,
      patient: t.patient?.[0]
        ? {
            id: String(t.patient[0]._id),
            name: patientName(t.patient[0]),
            systemId: t.patient[0].systemId ?? null,
          }
        : { id: String(t.patientId), name: 'Patient', systemId: null },
      assignee: t.assignee?.[0]
        ? { id: String(t.assignee[0]._id), fullName: t.assignee[0].fullName }
        : null,
    }));

    return res.json({
      status: 'success',
      data,
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  })
);

// GET /api/v1/inbox/unread-count — number of threads with unread patient messages
inboxRoutes.get(
  '/unread-count',
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = new Types.ObjectId(req.user!.clinicId);
    const [row] = await PortalMessageModel.aggregate([
      { $match: { clinicId, direction: 'patient_to_staff', readAt: null } },
      { $group: { _id: '$threadId', n: { $sum: 1 } } },
      { $group: { _id: null, threads: { $sum: 1 }, messages: { $sum: '$n' } } },
    ]);
    return res.json({
      status: 'success',
      data: { threads: row?.threads ?? 0, messages: row?.messages ?? 0 },
    });
  })
);

// GET /api/v1/inbox/staff — assignable care-team members
inboxRoutes.get(
  '/staff',
  asyncHandler(async (req: Request, res: Response) => {
    const staff = await UserModel.find(
      {
        clinicId: new Types.ObjectId(req.user!.clinicId),
        isActive: true,
        role: { $in: STAFF_ROLES },
      },
      { fullName: 1, role: 1 }
    )
      .sort({ fullName: 1 })
      .lean();
    return res.json({
      status: 'success',
      data: staff.map((u: any) => ({ id: String(u._id), fullName: u.fullName, role: u.role })),
    });
  })
);

// GET /api/v1/inbox/threads/:threadId — full conversation for the reading pane
inboxRoutes.get(
  '/threads/:threadId',
  validateRequest({ params: threadParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const { threadId } = req.params;

    const messages = await PortalMessageModel.find({
      clinicId: new Types.ObjectId(clinicId),
      threadId: new Types.ObjectId(threadId),
    })
      .populate('senderId', 'fullName role')
      .sort({ createdAt: 1 })
      .lean();

    if (messages.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Thread not found' });
    }

    const [meta, patient] = await Promise.all([
      loadThreadMeta(clinicId, threadId),
      PatientModel.findOne(
        { _id: messages[0].patientId, clinicId },
        { firstName: 1, lastName: 1, systemId: 1, sex: 1 }
      ).lean(),
    ]);

    return res.json({
      status: 'success',
      data: {
        threadId,
        subject: messages[0].subject,
        ...serializeMeta(meta),
        patient: patient
          ? {
              id: String(patient._id),
              name: patientName(patient),
              systemId: (patient as any).systemId ?? null,
              sex: (patient as any).sex ?? null,
            }
          : { id: String(messages[0].patientId), name: 'Patient' },
        messages: messages.map((m: any) => ({
          id: String(m._id),
          body: m.body,
          subject: m.subject,
          direction: m.direction,
          senderRole: m.senderRole,
          senderName:
            m.direction === 'patient_to_staff'
              ? patient
                ? patientName(patient)
                : 'Patient'
              : (m.senderId?.fullName ?? 'Care team'),
          attachments: m.attachments ?? [],
          readAt: m.readAt ?? null,
          createdAt: m.createdAt,
        })),
      },
    });
  })
);

// PATCH /api/v1/inbox/threads/:threadId — assign, prioritise, close / reopen
inboxRoutes.patch(
  '/threads/:threadId',
  validateRequest({ params: threadParamSchema, body: patchThreadSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, userId } = req.user!;
    const { threadId } = req.params;
    const { assigneeId, priority, status } = req.body as z.infer<typeof patchThreadSchema>;

    const firstMessage = await PortalMessageModel.findOne(
      { clinicId: new Types.ObjectId(clinicId), threadId: new Types.ObjectId(threadId) },
      { patientId: 1, subject: 1 }
    ).lean();
    if (!firstMessage) {
      return res.status(404).json({ error: 'NotFound', message: 'Thread not found' });
    }

    if (assigneeId) {
      const assignee = await UserModel.findOne({
        _id: assigneeId,
        clinicId,
        isActive: true,
        role: { $in: STAFF_ROLES },
      }).lean();
      if (!assignee) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Assignee is not an active care-team member',
        });
      }
    }

    const previous = await InboxThreadModel.findOne({ clinicId, threadId }).lean();

    const set: Record<string, unknown> = {};
    if (assigneeId !== undefined)
      set.assigneeId = assigneeId ? new Types.ObjectId(assigneeId) : null;
    if (priority) set.priority = priority;
    if (status) {
      set.status = status;
      set.closedAt = status === 'closed' ? new Date() : null;
      set.closedBy = status === 'closed' ? new Types.ObjectId(userId) : null;
    }

    await InboxThreadModel.updateOne(
      { clinicId: new Types.ObjectId(clinicId), threadId: new Types.ObjectId(threadId) },
      {
        $set: set,
        $setOnInsert: { patientId: firstMessage.patientId },
      },
      { upsert: true, runValidators: true }
    );

    // Let the new assignee know (unless they assigned it to themselves)
    if (
      assigneeId &&
      assigneeId !== userId &&
      String(previous?.assigneeId ?? '') !== String(assigneeId)
    ) {
      await createNotification({
        userId: new Types.ObjectId(assigneeId),
        clinicId: new Types.ObjectId(clinicId),
        type: 'system',
        title: 'Inbox thread assigned to you',
        message: `You were assigned the patient conversation "${firstMessage.subject}".`,
        link: `/inbox?thread=${threadId}`,
        metadata: { threadId },
      } as any).catch(() => undefined);
    }

    const meta = await loadThreadMeta(clinicId, threadId);
    const payload = { threadId, ...serializeMeta(meta), updatedBy: userId };
    emitToClinic(clinicId, 'inbox:thread:updated', payload);

    return res.json({ status: 'success', data: payload });
  })
);

// POST /api/v1/inbox/threads/:threadId/read — mark patient messages in a thread as read
inboxRoutes.post(
  '/threads/:threadId/read',
  validateRequest({ params: threadParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, userId } = req.user!;
    const { threadId } = req.params;

    const result = await PortalMessageModel.updateMany(
      {
        clinicId: new Types.ObjectId(clinicId),
        threadId: new Types.ObjectId(threadId),
        direction: 'patient_to_staff',
        readAt: null,
      },
      { $set: { readAt: new Date() } }
    );

    if (result.modifiedCount > 0) {
      emitToClinic(clinicId, 'inbox:unread:changed', { threadId, readBy: userId });
    }

    return res.json({ status: 'success', data: { marked: result.modifiedCount } });
  })
);

// POST /api/v1/inbox/threads/:threadId/reply — staff reply into an existing thread
inboxRoutes.post(
  '/threads/:threadId/reply',
  validateRequest({ params: threadParamSchema, body: replySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, userId, role } = req.user!;
    const { threadId } = req.params;
    const { body, attachments } = req.body as z.infer<typeof replySchema>;

    const latest = await PortalMessageModel.findOne({
      clinicId: new Types.ObjectId(clinicId),
      threadId: new Types.ObjectId(threadId),
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!latest) {
      return res.status(404).json({ error: 'NotFound', message: 'Thread not found' });
    }

    const patient = await PatientModel.findOne({
      _id: latest.patientId,
      clinicId,
      isActive: true,
    }).lean();
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }

    const subject = /^re:/i.test(latest.subject) ? latest.subject : `Re: ${latest.subject}`;
    const message = await PortalMessageModel.create({
      clinicId: new Types.ObjectId(clinicId),
      patientId: latest.patientId,
      senderId: new Types.ObjectId(userId),
      senderRole: role,
      subject,
      body,
      direction: 'staff_to_patient',
      threadId: new Types.ObjectId(threadId),
      parentMessageId: latest._id,
      attachments,
    });

    // Replying implies the thread has been read
    await PortalMessageModel.updateMany(
      {
        clinicId: new Types.ObjectId(clinicId),
        threadId: new Types.ObjectId(threadId),
        direction: 'patient_to_staff',
        readAt: null,
      },
      { $set: { readAt: new Date() } }
    );

    const payload = {
      messageId: String(message._id),
      threadId: String(message.threadId),
      clinicId: String(message.clinicId),
      patientId: String(message.patientId),
      subject: message.subject,
      body: message.body,
      direction: message.direction,
      createdAt: message.createdAt,
      senderRole: message.senderRole,
    };

    const patientUser = await UserModel.findOne({
      clinicId: new Types.ObjectId(clinicId),
      patientId: patient._id,
      role: 'PATIENT',
      isActive: true,
    }).lean();

    if (patientUser) {
      emitToUser(String(patientUser._id), 'portal:message:new', payload);
      if (patientUser.email && patientUser.preferences?.emailNotifications !== false) {
        sendMail({
          to: patientUser.email,
          subject: 'Reply from your care team',
          html: `
            <p>Hi ${patientName(patient)},</p>
            <p>Your care team has replied to your portal message.</p>
            <p><strong>Subject:</strong> ${message.subject}</p>
            <p>Please log in to the patient portal to view the full thread.</p>
          `,
        }).catch(() => undefined);
      }
    }

    emitToClinic(clinicId, 'portal:message:new', payload);
    emitToClinic(clinicId, 'inbox:unread:changed', { threadId, readBy: userId });

    return res.status(201).json({ status: 'success', data: payload });
  })
);
