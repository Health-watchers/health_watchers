import { z } from 'zod';

export const portalLoginSchema = z.object({
  email: z.string().email(),
  dateOfBirth: z.string().min(1),
});

export type PortalLoginDto = z.infer<typeof portalLoginSchema>;

export const portalMfaSetupSchema = z.object({
  method: z.enum(['totp', 'sms']),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
});

export type PortalMfaSetupDto = z.infer<typeof portalMfaSetupSchema>;

export const portalMfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  tempToken: z.string().min(1),
});

export type PortalMfaVerifyDto = z.infer<typeof portalMfaVerifySchema>;

export const portalMfaConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  backupCodes: z.array(z.string()).optional(),
});

export type PortalMfaConfirmDto = z.infer<typeof portalMfaConfirmSchema>;

export const portalMfaDisableSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const portalMessageCreateSchema = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1),
        url: z.string().url(),
        mimeType: z.string().optional(),
        size: z.number().optional(),
      })
    )
    .optional(),
  threadId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  parentMessageId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

export type PortalMessageCreateDto = z.infer<typeof portalMessageCreateSchema>;

export const portalMessageQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  q: z.string().optional(),
  threadId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

export type PortalMessageQueryDto = z.infer<typeof portalMessageQuerySchema>;

export type PortalMfaDisableDto = z.infer<typeof portalMfaDisableSchema>;

export const portalTimelineQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  eventType: z
    .enum(['encounter', 'lab_result', 'immunization', 'prescription', 'appointment'])
    .optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export type PortalTimelineQueryDto = z.infer<typeof portalTimelineQuerySchema>;

export interface TimelineEvent {
  id: string;
  type: 'encounter' | 'lab_result' | 'immunization' | 'prescription' | 'appointment';
  date: string;
  title: string;
  description: string;
  details: Record<string, unknown>;
  clinicId: string;
  createdAt: string;
}
