import { NextFunction, Request, Response } from 'express';
import { sendApiError } from '../utils/api-error';

/**
 * Shape of the authenticated user attached to the request by the
 * `authenticate` middleware. The clinic claim may be exposed under a few
 * different names depending on the token issuer, so we accept all of them.
 */
interface AuthenticatedUser {
  clinicId?: unknown;
  clinic_id?: unknown;
  clinic?: unknown;
  [key: string]: unknown;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clinicId?: string;
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Extracts a candidate clinic scope value from the authenticated user or the
 * decoded JWT payload attached to the request.
 */
function extractClinicScope(req: Request): unknown {
  const user = req.user as AuthenticatedUser | undefined;
  if (user) {
    if (user.clinicId !== undefined && user.clinicId !== null) {
      return user.clinicId;
    }
    if (user.clinic_id !== undefined && user.clinic_id !== null) {
      return user.clinic_id;
    }
    if (user.clinic !== undefined && user.clinic !== null) {
      return user.clinic;
    }
  }

  // Fall back to a decoded JWT payload if one was attached directly.
  const auth = (req as Request & { auth?: AuthenticatedUser }).auth;
  if (auth) {
    if (auth.clinicId !== undefined && auth.clinicId !== null) {
      return auth.clinicId;
    }
    if (auth.clinic_id !== undefined && auth.clinic_id !== null) {
      return auth.clinic_id;
    }
    if (auth.clinic !== undefined && auth.clinic !== null) {
      return auth.clinic;
    }
  }

  return undefined;
}

/**
 * Middleware that centralizes clinic-scoping logic.
 *
 * Must run after `authenticate`. It reads the clinic claim from the
 * authenticated user (or decoded JWT), validates that it is a non-empty
 * string, and attaches it to `req.clinicId` so controllers can scope their
 * database queries without re-extracting the claim themselves.
 *
 * Responds with 403 when the clinic scope is missing or invalid.
 */
export function clinicScope(req: Request, res: Response, next: NextFunction): void {
  const rawScope = extractClinicScope(req);

  if (typeof rawScope !== 'string' || rawScope.trim().length === 0) {
    sendApiError(res, 403, 'Missing or invalid clinic scope');
    return;
  }

  req.clinicId = rawScope;
  next();
}

export default clinicScope;
```

File: apps/api/src/middlewares/clinic-scope.middleware.test.ts

```typescript
import { NextFunction, Request, Response } from 'express';
import { clinicScope } from './clinic-scope.middleware';
import { sendApiError } from '../utils/api-error';

jest.mock('../utils/api-error', () => ({
  sendApiError: jest.fn(),
}));

const mockedSendApiError = sendApiError as jest.MockedFunction<typeof sendApiError>;

function createRequest(overrides: Partial<Request> = {}): Request {
  return {
    ...overrides,
  } as unknown as Request;
}

function createResponse(): Response {
  return {} as unknown as Response;
}

describe('clinicScope middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('responds with 403 when the clinic scope is missing', () => {
    const req = createRequest({ user: {} });
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    clinicScope(req, res, next);

    expect(mockedSendApiError).toHaveBeenCalledWith(
      res,
      403,
      expect.any(String),
    );
    expect(next).not.toHaveBeenCalled();
    expect(req.clinicId).toBeUndefined();
  });

  it('responds with 403 when the clinic scope is an empty string', () => {
    const req = createRequest({ user: { clinicId: '   ' } });
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    clinicScope(req, res, next);

    expect(mockedSendApiError).toHaveBeenCalledWith(
      res,
      403,
      expect.any(String),
    );
    expect(next).not.toHaveBeenCalled();
    expect(req.clinicId).toBeUndefined();
  });

  it('responds with 403 when the clinic scope is not a string', () => {
    const req = createRequest({ user: { clinicId: 12345 } });
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    clinicScope(req, res, next);

    expect(mockedSendApiError).toHaveBeenCalledWith(
      res,
      403,
      expect.any(String),
    );
    expect(next).not.toHaveBeenCalled();
    expect(req.clinicId).toBeUndefined();
  });

  it('responds with 403 when there is no authenticated user', () => {
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    clinicScope(req, res, next);

    expect(mockedSendApiError).toHaveBeenCalledWith(
      res,
      403,
      expect.any(String),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.clinicId and calls next when the scope is valid', () => {
    const req = createRequest({ user: { clinicId: 'clinic-123' } });
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    clinicScope(req, res, next);

    expect(req.clinicId).toBe('clinic-123');
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockedSendApiError).not.toHaveBeenCalled();
  });

  it('reads the clinic scope from the decoded JWT payload when present', () => {
    const req = createRequest({
      user: undefined,
      auth: { clinic_id: 'clinic-456' },
    } as unknown as Partial<Request>);
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    clinicScope(req, res, next);

    expect(req.clinicId).toBe('clinic-456');
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockedSendApiError).not.toHaveBeenCalled();
  });
});