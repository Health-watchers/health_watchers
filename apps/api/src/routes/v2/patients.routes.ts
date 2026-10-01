import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { fieldSelector } from '@api/utils/field-selector';
import {
  afterCursorFilter,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  NEWEST_FIRST,
} from '@api/utils/cursor';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { toPatientResponse } from '@api/modules/patients/patients.transformer';
import { v2Error, v2List } from './envelope';

/**
 * GET /api/v2/patients (#1434)
 *
 * - opaque cursor pagination (`?cursor=`), newest first — any page is a single
 *   index seek on `patients_clinicId_isActive_createdAt_id`
 * - sparse fieldsets (`?fields=id,firstName,lastName`)
 * - standard v2 envelope: `{ success, version, items, meta, links }`
 */
export const patientRoutes = Router();
patientRoutes.use(authenticate);

export const PATIENT_FIELD_CONFIG = {
  allowedFields: [
    'id',
    'systemId',
    'firstName',
    'lastName',
    'dateOfBirth',
    'sex',
    'contactNumber',
    'address',
    'riskLevel',
    'riskScore',
    'isActive',
    'photoUrl',
    'thumbnailUrl',
    'createdAt',
    'updatedAt',
  ],
  defaultFields: [
    'id',
    'systemId',
    'firstName',
    'lastName',
    'dateOfBirth',
    'sex',
    'contactNumber',
    'riskLevel',
    'riskScore',
    'isActive',
    'createdAt',
  ],
};
fieldSelector.registerFieldConfig('patient', PATIENT_FIELD_CONFIG);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
  fields: z.string().max(500).optional(),
  clinicId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
});

function toV2Patient(doc: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const full = toPatientResponse(doc) as unknown as Record<string, unknown>;
  const withExtras: Record<string, unknown> = {
    ...full,
    riskLevel: doc.riskLevel ?? null,
    riskScore: doc.riskScore ?? null,
    isActive: doc.isActive ?? true,
  };
  const source = new Map(Object.entries(withExtras));
  return Object.fromEntries(fields.map((field) => [field, source.get(field) ?? null]));
}

patientRoutes.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json(
          v2Error('ValidationError', 'Invalid query parameters', { issues: parsed.error.issues })
        );
    }
    const { limit, cursor, fields: fieldsParam } = parsed.data;

    // Sparse fieldsets — reject unknown fields rather than silently dropping them.
    let fields = PATIENT_FIELD_CONFIG.defaultFields;
    if (fieldsParam) {
      const { valid, invalidFields } = fieldSelector.validateRequestedFields(
        'patient',
        fieldsParam
      );
      if (!valid) {
        return res.status(400).json(
          v2Error('InvalidFields', `Unknown fields: ${invalidFields.join(', ')}`, {
            allowedFields: PATIENT_FIELD_CONFIG.allowedFields,
          })
        );
      }
      fields = [...fieldSelector.parseRequestedFields(fieldsParam)];
    }

    // Only SUPER_ADMIN may cross clinic boundaries (same rule as v1).
    const clinicId =
      req.user!.role === 'SUPER_ADMIN' && parsed.data.clinicId
        ? parsed.data.clinicId
        : req.user!.clinicId;

    const filter: Record<string, unknown> = { clinicId, isActive: true };
    if (cursor) {
      try {
        Object.assign(filter, afterCursorFilter(decodeCursor(cursor)));
      } catch (err) {
        if (err instanceof InvalidCursorError) {
          return res.status(400).json(v2Error('InvalidCursor', err.message));
        }
        throw err;
      }
    }

    // Always fetch the sort keys so the next cursor can be built.
    const projection: Record<string, 1> = Object.fromEntries([
      ['_id', 1],
      ['createdAt', 1],
      ...fields.filter((field) => field !== 'id').map((field) => [field, 1]),
    ]);

    const docs = await PatientModel.find(filter)
      .select(projection)
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .hint('patients_clinicId_isActive_createdAt_id')
      .lean<Record<string, unknown>[]>();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: new Date(last.createdAt as Date), id: String(last._id) })
        : null;

    return res.json(
      v2List(
        req,
        page.map((doc) => toV2Patient(doc, fields)),
        { limit, count: page.length, hasMore, nextCursor, fields }
      )
    );
  })
);
