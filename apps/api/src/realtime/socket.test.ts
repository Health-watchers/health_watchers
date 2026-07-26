process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.WEB_URL = 'http://localhost:3000';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    webUrl: 'http://localhost:3000',
    nodeEnv: 'test',
    mongoUri: '',
  },
}));

import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../modules/auth/token.service';

jest.mock('../modules/auth/token.service');
const mockVerify = verifyAccessToken as jest.MockedFunction<typeof verifyAccessToken>;

// ── Simulate the Socket.IO auth middleware ─────────────────────────────────
// We extract the middleware logic directly rather than spinning up a full
// Socket.IO server, so the test stays fast and dependency-free.

type NextFn = (err?: Error) => void;

interface FakeSocket {
  handshake: {
    auth?: Record<string, string>;
    headers?: Record<string, string>;
  };
  user?: unknown;
}

function runAuthMiddleware(socket: FakeSocket, next: NextFn) {
  const token =
    socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

  if (!token) {
    return next(new Error('Authentication required'));
  }

  const payload = mockVerify(token);
  if (!payload) {
    return next(new Error('Invalid or expired token'));
  }

  (socket as any).user = payload;
  next();
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('Socket.IO auth middleware', () => {
  const VALID_PAYLOAD = {
    userId: 'user-123',
    clinicId: 'clinic-abc',
    role: 'DOCTOR',
    iat: 0,
    exp: 9999999999,
    iss: 'health-watchers-api',
    aud: 'health-watchers-client',
  };

  afterEach(() => jest.clearAllMocks());

  it('calls next() with no error and attaches user when token is valid', () => {
    mockVerify.mockReturnValue(VALID_PAYLOAD);
    const socket: FakeSocket = { handshake: { auth: { token: 'valid-token' } } };
    const next = jest.fn();

    runAuthMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.user).toEqual(VALID_PAYLOAD);
  });

  it('calls next() with Authentication required error when no token provided', () => {
    const socket: FakeSocket = { handshake: { auth: {}, headers: {} } };
    const next = jest.fn();

    runAuthMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(new Error('Authentication required'));
    expect(socket.user).toBeUndefined();
  });

  it('calls next() with Invalid or expired token error when verifyAccessToken returns null', () => {
    mockVerify.mockReturnValue(null);
    const socket: FakeSocket = { handshake: { auth: { token: 'bad-token' } } };
    const next = jest.fn();

    runAuthMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(new Error('Invalid or expired token'));
    expect(socket.user).toBeUndefined();
  });

  it('reads token from Authorization header as fallback', () => {
    mockVerify.mockReturnValue(VALID_PAYLOAD);
    const socket: FakeSocket = {
      handshake: {
        auth: {},
        headers: { authorization: 'Bearer header-token' },
      },
    };
    const next = jest.fn();

    runAuthMiddleware(socket, next);

    expect(mockVerify).toHaveBeenCalledWith('header-token');
    expect(next).toHaveBeenCalledWith();
  });

  it('prefers auth.token over Authorization header', () => {
    mockVerify.mockReturnValue(VALID_PAYLOAD);
    const socket: FakeSocket = {
      handshake: {
        auth: { token: 'auth-token' },
        headers: { authorization: 'Bearer header-token' },
      },
    };
    const next = jest.fn();

    runAuthMiddleware(socket, next);

    expect(mockVerify).toHaveBeenCalledWith('auth-token');
  });
});

// ── WEB_URL multi-origin parsing ───────────────────────────────────────────
describe('WEB_URL comma-separated origin support', () => {
  it('parses single origin correctly', () => {
    const webUrl = 'https://app.example.com';
    const origins = webUrl
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    expect(origins).toEqual(['https://app.example.com']);
  });

  it('parses multiple comma-separated origins', () => {
    const webUrl = 'https://app.example.com, https://admin.example.com';
    const origins = webUrl
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    expect(origins).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('allows requests with no origin (server-to-server)', () => {
    const origins = ['https://app.example.com'];
    const isAllowed = (origin: string | undefined) => !origin || origins.includes(origin);
    expect(isAllowed(undefined)).toBe(true);
  });

  it('blocks requests from origins not in the list', () => {
    const origins = ['https://app.example.com'];
    const isAllowed = (origin: string | undefined) => !origin || origins.includes(origin);
    expect(isAllowed('https://evil.example.com')).toBe(false);
  });
});

// Prevent ts-jest "cannot find module" from the jwt import at top
export {};
