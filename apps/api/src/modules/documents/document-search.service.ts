/**
 * Document search — Issue #1247
 *
 * Content search backed by the Mongo text index on
 * { ocrText, fileName, description, tags }. Results are always scoped to the
 * caller's clinic and filtered so that access-controlled documents the caller
 * cannot see are never returned.
 */
import { Types } from 'mongoose';
import { DocumentModel } from './models/document.model';
import { grantedDocumentIds } from './document-access.service';

export interface DocumentSearchParams {
  clinicId: string;
  userId: string;
  role: string;
  q?: string;
  tags?: string[];
  documentType?: string;
  patientId?: string;
  includeExpired?: boolean;
  page?: number;
  limit?: number;
}

const ADMIN_ROLES = new Set(['CLINIC_ADMIN', 'SUPER_ADMIN']);

export interface DocumentSearchResult {
  results: Array<Record<string, unknown>>;
  page: number;
  limit: number;
  total: number;
  matchedByContent: boolean;
}

export async function searchDocuments(params: DocumentSearchParams): Promise<DocumentSearchResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));

  const filter: Record<string, unknown> = { clinicId: new Types.ObjectId(params.clinicId) };

  if (!params.includeExpired) {
    filter.status = { $in: ['active', 'archived'] };
  }
  if (params.documentType) filter.documentType = params.documentType;
  if (params.patientId && /^[0-9a-fA-F]{24}$/.test(params.patientId)) {
    filter.patientId = new Types.ObjectId(params.patientId);
  }
  if (params.tags && params.tags.length > 0) filter.tags = { $all: params.tags };

  // Access scoping: non-admins only see clinic-wide docs, their own uploads,
  // docs where their role/id is allow-listed, or docs they have a grant for.
  if (!ADMIN_ROLES.has(params.role)) {
    const grantIds = await grantedDocumentIds(params.userId, params.clinicId);
    filter.$or = [
      { accessLevel: { $in: [null, 'clinic'] } },
      { uploadedBy: new Types.ObjectId(params.userId) },
      { allowedRoles: params.role },
      { allowedUserIds: new Types.ObjectId(params.userId) },
      ...(grantIds.length ? [{ _id: { $in: grantIds } }] : []),
    ];
  }

  const useText = Boolean(params.q && params.q.trim());
  const query = useText ? { ...filter, $text: { $search: params.q!.trim() } } : filter;

  const projection = useText ? { score: { $meta: 'textScore' }, ocrText: 0 } : { ocrText: 0 };
  const sort = useText
    ? { score: { $meta: 'textScore' } }
    : ({ createdAt: -1 } as Record<string, 1 | -1>);

  const [results, total] = await Promise.all([
    DocumentModel.find(query, projection)
      .sort(sort as never)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    DocumentModel.countDocuments(query),
  ]);

  return {
    results: results as Array<Record<string, unknown>>,
    page,
    limit,
    total,
    matchedByContent: useText,
  };
}
