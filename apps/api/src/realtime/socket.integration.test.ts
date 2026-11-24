/**
 * Socket.IO integration tests — real server, real socket.io-client.
 *
 * Guards tenant isolation for every realtime event type: a client in clinic A
 * must never receive an event emitted to clinic B (or to a user in clinic B),
 * plus handshake auth (expired / revoked tokens) and reconnection re-join.
 */

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      tempTokenSecret: 'test-temp-secret-32-chars-long!!!!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    webUrl: 'http://localhost:3000',
    nodeEnv: 'test',
    mongoUri: '',
  },
}));

// In-memory cache so the token denylist works without Redis.
jest.mock('@api/services/cache.service', () => {
  const store = new Map<string, unknown>();
  return {
    cache: {
      get: async (key: string) => (store.has(key) ? store.get(key) : null),
      set: async (key: string, value: unknown) => {
        store.set(key, value);
      },
      del: async (key: string) => {
        store.delete(key);
      },
    },
  };
});

import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { initSocket, getIO, emitToClinic, emitToUser } from './socket';
import { signAccessToken, TokenPayload } from '../modules/auth/token.service';
import { addToDenylist, setUserInvalidatedAt } from '../services/token-denylist.service';

// ── Event catalogue ──────────────────────────────────────────────────────────
// Every event emitted through emitToClinic / emitToUser in the API.

const CLINIC_EVENTS = [
  'activity:new-entry',
  'balance:critical',
  'balance:low_warning',
  'collaboration:cursor-update',
  'collaboration:edit-operation',
  'collaboration:user-joined',
  'collaboration:user-left',
  'document:uploaded',
  'encounter:created',
  'encounter:updated',
  'inbox:thread:updated',
  'inbox:unread:changed',
  'lab:critical',
  'lab:resulted',
  'notification:alert',
  'notification:appointment-update',
  'patient:created',
  'payment:confirmed',
  'portal:message:new',
  'prescription:allergy_warning',
  'presence:activity',
  'presence:status-changed',
  'presence:updated',
  'presence:user-offline',
  'presence:user-online',
  'provider-scheduling:availability-updated',
  'sync:batch',
];

const USER_EVENTS = [
  'activity:new-entry',
  'activity:subscribed',
  'activity:unsubscribed',
  'appointment:reminder',
  'appointment:video_ended',
  'appointment:video_started',
  'cosignature:completed',
  'cosignature:rejected',
  'cosignature:requested',
  'lab:critical',
  'notification:alert',
  'notification:appointment-reminder',
  'notification:appointment-update',
  'notification:cleared',
  'notification:critical-result',
  'notification:data-change',
  'notification:marked-read',
  'notification:new',
  'payment:claimable_expiring',
  'portal:message:new',
  'telehealth:chat',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLINIC_A = 'clinic-a';
const CLINIC_B = 'clinic-b';
const USER_A: TokenPayload = { userId: 'user-a', role: 'DOCTOR', clinicId: CLINIC_A };
const USER_B: TokenPayload = { userId: 'user-b', role: 'DOCTOR', clinicId: CLINIC_B };

let httpServer: HttpServer;
let url: string;
const clients: ClientSocket[] = [];

function connect(
  token: string | undefined,
  opts: { reconnection?: boolean; auth?: Record<string, unknown> } = {}
) {
  const socket = ioClient(url, {
    auth: { ...(token ? { token } : {}), ...opts.auth },
    transports: ['websocket'],
    reconnection: opts.reconnection ?? false,
    reconnectionDelay: 50,
    reconnectionDelayMax: 100,
    forceNew: true,
    extraHeaders: { origin: 'http://localhost:3000' },
  });
  clients.push(socket);
  return socket;
}

function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

function waitForConnectError(socket: ClientSocket): Promise<Error> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => reject(new Error('expected handshake to be rejected')));
    socket.once('connect_error', resolve);
  });
}

async function connected(user: TokenPayload, opts?: { reconnection?: boolean }) {
  const socket = connect(signAccessToken(user), opts);
  await waitForConnect(socket);
  return socket;
}

/** Wait until the server has joined the socket to its rooms. */
async function waitForRooms(socket: ClientSocket, rooms: string[]) {
  for (let i = 0; i < 50; i++) {
    const server = getIO().sockets.sockets.get(socket.id!);
    if (server && rooms.every((r) => server.rooms.has(r))) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`socket never joined ${rooms.join(', ')}`);
}

/** Collect every event a client receives while `fn` runs. */
async function recordEvents(sockets: ClientSocket[], fn: () => void | Promise<void>) {
  const received = sockets.map(() => [] as Array<{ event: string; data: unknown }>);
  const listeners = sockets.map((socket, i) => {
    const listener = (event: string, data: unknown) => received[i].push({ event, data });
    socket.onAny(listener);
    return listener;
  });

  await fn();
  // Give the server time to flush every emit over the websocket.
  await new Promise((r) => setTimeout(r, 100));

  sockets.forEach((socket, i) => socket.offAny(listeners[i]));
  return received;
}

beforeAll((done) => {
  httpServer = createServer();
  initSocket(httpServer);
  httpServer.listen(0, () => {
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    done();
  });
});

afterEach(() => {
  clients.splice(0).forEach((c) => c.disconnect());
});

afterAll((done) => {
  getIO().close();
  httpServer.close(() => done());
});

// ── Tenant isolation ─────────────────────────────────────────────────────────

describe('tenant isolation', () => {
  let clientA: ClientSocket;
  let clientB: ClientSocket;

  beforeEach(async () => {
    clientA = await connected(USER_A);
    clientB = await connected(USER_B);
    await waitForRooms(clientA, [`clinic:${CLINIC_A}`, `user:${USER_A.userId}`]);
    await waitForRooms(clientB, [`clinic:${CLINIC_B}`, `user:${USER_B.userId}`]);
  });

  it.each(CLINIC_EVENTS)('clinic event %s only reaches the target clinic', async (event) => {
    const [a, b] = await recordEvents([clientA, clientB], () => {
      emitToClinic(CLINIC_B, event, { clinicId: CLINIC_B, phi: 'clinic-b-secret' });
    });

    expect(a.filter((e) => e.event === event)).toHaveLength(0);
    expect(b.filter((e) => e.event === event)).toEqual([
      { event, data: { clinicId: CLINIC_B, phi: 'clinic-b-secret' } },
    ]);
  });

  it.each(USER_EVENTS)('user event %s only reaches the target user', async (event) => {
    const [a, b] = await recordEvents([clientA, clientB], () => {
      emitToUser(USER_B.userId, event, { userId: USER_B.userId, phi: 'user-b-secret' });
    });

    expect(a.filter((e) => e.event === event)).toHaveLength(0);
    expect(b.filter((e) => e.event === event)).toHaveLength(1);
  });

  it('does not deliver another clinic presence events on connect', async () => {
    const [a, b] = await recordEvents([clientA, clientB], async () => {
      const other = await connected({ userId: 'user-b2', role: 'NURSE', clinicId: CLINIC_B });
      await waitForRooms(other, [`clinic:${CLINIC_B}`]);
    });

    expect(a.some((e) => e.event === 'presence:user-online')).toBe(false);
    expect(b.some((e) => e.event === 'presence:user-online')).toBe(true);
  });

  it('scopes client-triggered collaboration and presence broadcasts to the sender clinic', async () => {
    const [a, b] = await recordEvents([clientA, clientB], () => {
      clientB.emit('collaboration:start-editing', {
        resourceId: 'enc-1',
        resourceType: 'encounter',
        color: '#f00',
      });
      clientB.emit('collaboration:cursor-move', {
        resourceId: 'enc-1',
        resourceType: 'encounter',
        position: { line: 1, column: 1 },
      });
      clientB.emit('collaboration:stop-editing', { resourceId: 'enc-1', resourceType: 'encounter' });
      clientB.emit('presence:status-change', { status: 'idle' });
      clientB.emit('presence:activity', { resourceType: 'patient', resourceId: 'p-1' });
    });

    expect(a.filter((e) => /^(collaboration|presence):/.test(e.event))).toHaveLength(0);
    expect(b.map((e) => e.event)).toEqual(
      expect.arrayContaining(['collaboration:user-joined', 'presence:status-changed'])
    );
  });

  it('ignores a client attempt to choose its clinic via handshake data', async () => {
    const spoof = connect(signAccessToken(USER_A), { auth: { clinicId: CLINIC_B } });
    await waitForConnect(spoof);
    await waitForRooms(spoof, [`clinic:${CLINIC_A}`]);

    const [received] = await recordEvents([spoof], () => {
      emitToClinic(CLINIC_B, 'lab:resulted', { phi: 'clinic-b-secret' });
    });

    expect(received.some((e) => e.event === 'lab:resulted')).toBe(false);
    expect(getIO().sockets.sockets.get(spoof.id!)!.rooms.has(`clinic:${CLINIC_B}`)).toBe(false);
  });
});

// ── Handshake authentication ─────────────────────────────────────────────────

describe('handshake authentication', () => {
  it('rejects a connection without a token', async () => {
    const err = await waitForConnectError(connect(undefined));
    expect(err.message).toBe('Authentication required');
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      { ...USER_A, jti: 'expired-jti' },
      'test-access-secret-32-chars-long!!',
      {
        expiresIn: -10,
        issuer: 'health-watchers-api',
        audience: 'health-watchers-client',
      }
    );
    const err = await waitForConnectError(connect(expired));
    expect(err.message).toBe('Invalid or expired token');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ ...USER_A, jti: 'forged' }, 'not-the-real-secret', {
      expiresIn: '15m',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    });
    const err = await waitForConnectError(connect(forged));
    expect(err.message).toBe('Invalid or expired token');
  });

  it('rejects a revoked (denylisted) token', async () => {
    const token = signAccessToken(USER_A);
    const { jti } = jwt.decode(token) as { jti: string };
    await addToDenylist(jti, 900);

    const err = await waitForConnectError(connect(token));
    expect(err.message).toBe('Invalid or expired token');
  });

  it('rejects tokens issued before a logout-all invalidation', async () => {
    const user = { ...USER_A, userId: 'user-logged-out' };
    const token = signAccessToken(user);
    await setUserInvalidatedAt(user.userId, Math.floor(Date.now() / 1000) + 60);

    const err = await waitForConnectError(connect(token));
    expect(err.message).toBe('Invalid or expired token');
  });

  it('accepts a valid token passed as a Bearer Authorization header', async () => {
    const socket = ioClient(url, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: { authorization: `Bearer ${signAccessToken(USER_A)}` },
    });
    clients.push(socket);
    await expect(waitForConnect(socket)).resolves.toBeUndefined();
  });
});

// ── Reconnection ─────────────────────────────────────────────────────────────

describe('reconnection', () => {
  it('re-joins only its own clinic and user rooms after the transport drops', async () => {
    const clientA = await connected(USER_A, { reconnection: true });
    const clientB = await connected(USER_B);
    const firstId = clientA.id;

    const reconnected = new Promise<void>((r) => clientA.io.once('reconnect', () => r()));
    clientA.io.engine.close();
    await reconnected;

    expect(clientA.id).not.toBe(firstId);
    expect(getIO().sockets.sockets.has(firstId!)).toBe(false);
    await waitForRooms(clientA, [`clinic:${CLINIC_A}`, `user:${USER_A.userId}`]);

    const [a] = await recordEvents([clientA, clientB], () => {
      emitToClinic(CLINIC_A, 'lab:resulted', { labId: 'l-a' });
      emitToUser(USER_A.userId, 'notification:new', { id: 'n-a' });
      emitToClinic(CLINIC_B, 'lab:resulted', { labId: 'l-b' });
      emitToUser(USER_B.userId, 'notification:new', { id: 'n-b' });
    });

    expect(a.map((e) => e.data)).toEqual(
      expect.arrayContaining([{ labId: 'l-a' }, { id: 'n-a' }])
    );
    expect(a.map((e) => e.data)).not.toEqual(
      expect.arrayContaining([{ labId: 'l-b' }])
    );
    expect(a.map((e) => e.data)).not.toEqual(expect.arrayContaining([{ id: 'n-b' }]));
  });

  it('leaves its rooms on disconnect so no further events are routed to it', async () => {
    const clientA = await connected(USER_A);
    const id = clientA.id!;
    clientA.disconnect();

    for (let i = 0; i < 50 && getIO().sockets.sockets.has(id); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(getIO().sockets.adapter.rooms.get(`clinic:${CLINIC_A}`)?.has(id) ?? false).toBe(false);
    expect(getIO().sockets.adapter.rooms.get(`user:${USER_A.userId}`)?.has(id) ?? false).toBe(
      false
    );
  });
});
