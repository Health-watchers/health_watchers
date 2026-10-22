/**
 * FHIR R4 read API (#1435), mounted at /fhir/r4.
 *
 *   GET /metadata                                   CapabilityStatement (public)
 *   GET /Patient/:id                                read
 *   GET /Patient?identifier=[system|]value          search
 *   GET /Encounter?patient=                         search
 *   GET /Observation?patient=&category=vital-signs  search
 *
 * Authenticated with clinic API keys carrying SMART-style scopes
 * (`patient/*.read` or `patient/<Type>.read`); results are limited to the
 * key's clinic. Every request — including rejected ones — is audit-logged.
 */
import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import logger from '@api/utils/logger';
import { auditLog } from '@api/modules/audit/audit.service';
import { authenticateApiKey, ApiKeyContext } from '@api/middlewares/api-key.middleware';
import { apiKeyRateLimit } from '@api/middlewares/api-key-rate-limit.middleware';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import {
  afterCursorFilter,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  NEWEST_FIRST,
} from '@api/utils/cursor';
import {
  capabilityStatement,
  FHIR_JSON,
  FhirReadResource,
  IssueCode,
  operationOutcome,
  PATIENT_IDENTIFIER_SYSTEM,
  searchBundle,
  toFhirEncounter,
  toFhirPatient,
  toVitalSignsObservations,
} from './fhir.resources';

type FhirResourceType = 'Patient' | 'Encounter' | 'Observation';

const DEFAULT_COUNT = 20;
const MAX_COUNT = 100;

class FhirError extends Error {
  constructor(
    readonly status: number,
    readonly code: IssueCode,
    message: string
  ) {
    super(message);
  }
}

const STATUS_TO_ISSUE: Record<number, IssueCode> = {
  400: 'invalid',
  401: 'login',
  403: 'forbidden',
  404: 'not-found',
  429: 'throttled',
};

function baseUrl(req: Request): string {
  return (
    process.env.FHIR_BASE_URL?.replace(/\/$/, '') ??
    `${req.protocol}://${req.get('host')}${req.baseUrl}`
  );
}

function pageUrl(req: Request, cursor?: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === '_cursor') continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
  }
  if (cursor) params.set('_cursor', cursor);
  const qs = params.toString();
  return `${baseUrl(req)}${req.path}${qs ? `?${qs}` : ''}`;
}

function singleParam(req: Request, name: string): string | undefined {
  const value = new Map(Object.entries(req.query)).get(name);
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw new FhirError(400, 'invalid', `Search parameter '${name}' may only be given once`);
  }
  return String(value);
}

function parseCount(req: Request): number {
  const raw = singleParam(req, '_count');
  if (raw === undefined) return DEFAULT_COUNT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT) {
    throw new FhirError(400, 'invalid', `_count must be an integer between 1 and ${MAX_COUNT}`);
  }
  return n;
}

function cursorFilter(req: Request): Record<string, unknown> {
  const raw = singleParam(req, '_cursor');
  if (!raw) return {};
  try {
    return afterCursorFilter(decodeCursor(raw));
  } catch (err) {
    if (err instanceof InvalidCursorError) throw new FhirError(400, 'invalid', err.message);
    throw err;
  }
}

/** `Patient/<id>` or `<id>` → ObjectId string, or null when it cannot match anything. */
function parsePatientReference(req: Request): string | null {
  const raw = singleParam(req, 'patient');
  if (!raw) throw new FhirError(400, 'invalid', "Search parameter 'patient' is required");
  const id = raw.startsWith('Patient/') ? raw.slice('Patient/'.length) : raw;
  return isValidObjectId(id) && String(new Types.ObjectId(id)) === id ? id : null;
}

function clinicOf(req: Request): string {
  return (req as any).apiKey.clinicId as string;
}

/** Record what the handler returned so the audit entry can include it. */
function noteAccess(res: Response, details: Record<string, unknown>): void {
  res.locals.fhirAudit = { ...(res.locals.fhirAudit ?? {}), ...details };
}

// ── Middleware ────────────────────────────────────────────────────────────────

/** FHIR media type everywhere; any error body becomes an OperationOutcome. */
const fhirResponses: RequestHandler = (_req, res, next) => {
  res.type(FHIR_JSON);
  const json = res.json.bind(res);
  res.json = (body?: any): Response => {
    if (res.statusCode >= 400 && body?.resourceType !== 'OperationOutcome') {
      const code = STATUS_TO_ISSUE[res.statusCode] ?? 'exception';
      return json(operationOutcome(code, body?.message ?? body?.error ?? 'Request failed'));
    }
    return json(body);
  };
  next();
};

/** Audit every FHIR request once the response is finished. */
const fhirAudit: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    const apiKey = (req as any).apiKey as ApiKeyContext | undefined;
    const details = (res.locals.fhirAudit ?? {}) as Record<string, unknown>;
    void auditLog(
      {
        action: 'FHIR_ACCESS',
        resourceType: (details.resourceType as string) ?? req.path.split('/')[1] ?? 'metadata',
        resourceId: details.resourceId as string | undefined,
        userId: req.user?.userId && isValidObjectId(req.user.userId) ? req.user.userId : undefined,
        clinicId:
          apiKey?.clinicId && isValidObjectId(apiKey.clinicId) ? apiKey.clinicId : undefined,
        outcome: res.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
        metadata: {
          method: req.method,
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
          status: res.statusCode,
          apiKeyId: apiKey?.id,
          ...details,
        },
      },
      req
    );
  });
  next();
};

/** Accept `Authorization: Bearer hw_…` (FHIR clients' default) as well as `ApiKey hw_…`. */
const fhirAuthenticate: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer hw_')) req.headers.authorization = `ApiKey ${header.slice(7)}`;
  Promise.resolve(authenticateApiKey(req, res, next)).catch(next);
};

function requireFhirScope(type: FhirResourceType): RequestHandler {
  return (req, res, next) => {
    const scopes = ((req as any).apiKey as ApiKeyContext | undefined)?.scopes ?? [];
    const granted = scopes.some((s) => s === 'patient/*.read' || s === `patient/${type}.read`);
    if (!granted) {
      res
        .status(403)
        .json(
          operationOutcome(
            'forbidden',
            `API key lacks scope patient/${type}.read (or patient/*.read)`
          )
        );
      return;
    }
    next();
  };
}

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    fn(req, res).catch(next);

// ── Routes ────────────────────────────────────────────────────────────────────

export const fhirRouter = Router();
fhirRouter.use(fhirResponses, fhirAudit);

fhirRouter.get('/metadata', (req, res) => {
  noteAccess(res, { resourceType: 'CapabilityStatement', interaction: 'capabilities' });
  res.json(capabilityStatement(baseUrl(req)));
});

fhirRouter.use(fhirAuthenticate, apiKeyRateLimit());

fhirRouter.get(
  '/Patient/:id',
  requireFhirScope('Patient'),
  handle(async (req, res) => {
    const { id } = req.params;
    noteAccess(res, { resourceType: 'Patient', resourceId: id, interaction: 'read' });
    const doc = isValidObjectId(id)
      ? await PatientModel.findOne({ _id: id, clinicId: clinicOf(req), isActive: true }).lean()
      : null;
    if (!doc) throw new FhirError(404, 'not-found', `Patient/${id} not found`);
    res.json(toFhirPatient(doc));
  })
);

fhirRouter.get(
  '/Patient',
  requireFhirScope('Patient'),
  handle(async (req, res) => {
    const count = parseCount(req);
    const filter: Record<string, unknown> = { clinicId: clinicOf(req), isActive: true };

    const identifier = singleParam(req, 'identifier');
    let matchesNothing = false;
    if (identifier !== undefined) {
      const bar = identifier.indexOf('|');
      const system = bar >= 0 ? identifier.slice(0, bar) : undefined;
      const value = bar >= 0 ? identifier.slice(bar + 1) : identifier;
      if ((system && system !== PATIENT_IDENTIFIER_SYSTEM) || !value) matchesNothing = true;
      filter.systemId = value;
    }

    const [total, docs] = matchesNothing
      ? [0, []]
      : await Promise.all([
          PatientModel.countDocuments(filter),
          PatientModel.find({ ...filter, ...cursorFilter(req) })
            .sort(NEWEST_FIRST)
            .limit(count + 1)
            .lean<Record<string, any>[]>(),
        ]);
    const hasMore = docs.length > count;
    const page = docs.slice(0, count);
    const last = page[page.length - 1];
    noteAccess(res, {
      resourceType: 'Patient',
      interaction: 'search-type',
      returned: page.length,
      resourceIds: page.map((d) => String(d._id)),
    });
    res.json(
      searchBundle({
        baseUrl: baseUrl(req),
        selfUrl: pageUrl(req, singleParam(req, '_cursor')),
        nextUrl: hasMore
          ? pageUrl(
              req,
              encodeCursor({ createdAt: new Date(last.createdAt), id: String(last._id) })
            )
          : null,
        resources: page.map(toFhirPatient),
        total,
      })
    );
  })
);

fhirRouter.get(
  '/Encounter',
  requireFhirScope('Encounter'),
  handle(async (req, res) => {
    const count = parseCount(req);
    const patientId = parsePatientReference(req);
    const filter = { clinicId: clinicOf(req), patientId, isActive: { $ne: false } };

    const [total, docs] = !patientId
      ? [0, []]
      : await Promise.all([
          EncounterModel.countDocuments(filter),
          EncounterModel.find({ ...filter, ...cursorFilter(req) })
            .sort(NEWEST_FIRST)
            .limit(count + 1)
            .lean<Record<string, any>[]>(),
        ]);
    const hasMore = docs.length > count;
    const page = docs.slice(0, count);
    const last = page[page.length - 1];
    noteAccess(res, {
      resourceType: 'Encounter',
      interaction: 'search-type',
      patient: patientId,
      returned: page.length,
    });
    res.json(
      searchBundle({
        baseUrl: baseUrl(req),
        selfUrl: pageUrl(req, singleParam(req, '_cursor')),
        nextUrl: hasMore
          ? pageUrl(
              req,
              encodeCursor({ createdAt: new Date(last.createdAt), id: String(last._id) })
            )
          : null,
        resources: page.map(toFhirEncounter),
        total,
      })
    );
  })
);

fhirRouter.get(
  '/Observation',
  requireFhirScope('Observation'),
  handle(async (req, res) => {
    const count = parseCount(req);
    const patientId = parsePatientReference(req);
    const category = singleParam(req, 'category');
    // Token search: `vital-signs` or `<system>|vital-signs`. Other categories match nothing.
    const categoryMatches =
      category === undefined ||
      category.split(',').some((c) => c.split('|').pop() === 'vital-signs');

    const docs =
      !patientId || !categoryMatches
        ? []
        : await EncounterModel.find({
            clinicId: clinicOf(req),
            patientId,
            isActive: { $ne: false },
            vitalSigns: { $exists: true, $ne: null },
            ...cursorFilter(req),
          })
            .sort(NEWEST_FIRST)
            .limit(count + 1)
            .lean<Record<string, any>[]>();
    const hasMore = docs.length > count;
    const page = docs.slice(0, count);
    const last = page[page.length - 1];
    const observations: FhirReadResource[] = page.flatMap(toVitalSignsObservations);
    noteAccess(res, {
      resourceType: 'Observation',
      interaction: 'search-type',
      patient: patientId,
      returned: observations.length,
    });
    res.json(
      searchBundle({
        baseUrl: baseUrl(req),
        selfUrl: pageUrl(req, singleParam(req, '_cursor')),
        nextUrl: hasMore
          ? pageUrl(
              req,
              encodeCursor({ createdAt: new Date(last.createdAt), id: String(last._id) })
            )
          : null,
        resources: observations,
      })
    );
  })
);

fhirRouter.use((req, res) => {
  res
    .status(404)
    .json(
      operationOutcome('not-supported', `${req.method} ${req.baseUrl}${req.path} is not supported`)
    );
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
fhirRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof FhirError) {
    return res.status(err.status).json(operationOutcome(err.code, err.message));
  }
  logger.error({ err }, '[fhir] request failed');
  return res.status(500).json(operationOutcome('exception', 'Internal server error'));
});
