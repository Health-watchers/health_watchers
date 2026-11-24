import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { verifyAccessTokenAsync, TokenPayload } from '../modules/auth/token.service';
import { config } from '@health-watchers/config';
import { CollaborationHandler } from './collaboration.handler';
import { PresenceHandler } from './presence.handler';
import { SyncHandler } from './sync.handler';
import logger from '../utils/logger';

let io: SocketIOServer | null = null;

interface AuthenticatedSocket extends Socket {
  user: TokenPayload;
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  const allowedOrigins = config.webUrl
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Socket.IO CORS: origin '${origin}' not allowed`));
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Redis adapter so events fan out across API replicas (Issue #1775)
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (err) => logger.error('Socket.IO Redis pub client error', err));
    subClient.on('error', (err) => logger.error('Socket.IO Redis sub client error', err));
    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io!.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter attached');
      })
      .catch((err) => logger.error('Failed to attach Socket.IO Redis adapter', err));
  }

  // JWT authentication middleware — checks signature, expiry and the denylist
  // so revoked (logged-out) tokens cannot open a realtime channel.
  io.use(async (socket: Socket, next: (err?: Error) => void) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const payload = await verifyAccessTokenAsync(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }

    // Attach user info to socket for use in handlers
    (socket as AuthenticatedSocket).user = payload;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as AuthenticatedSocket).user;
    const clinicRoom = `clinic:${user.clinicId}`;
    const userRoom = `user:${user.userId}`;

    socket.join(clinicRoom);
    socket.join(userRoom);

    logger.info(`User connected: ${user.userId} (socket: ${socket.id})`);

    // Appointment room handlers (ported from the removed SocketService, Issue #1775)
    socket.on('join_appointment', (appointmentId: string) => {
      if (typeof appointmentId !== 'string' || !appointmentId) return;
      socket.join(`appointment:${appointmentId}`);
    });

    socket.on('leave_appointment', (appointmentId: string) => {
      if (typeof appointmentId !== 'string' || !appointmentId) return;
      socket.leave(`appointment:${appointmentId}`);
    });

    // Register real-time collaboration handlers (Issue #1234)
    CollaborationHandler.registerHandlers(socket, user.userId, user.userName || user.email);

    // Register presence handlers (Issue #1234)
    PresenceHandler.registerHandlers(
      socket,
      user.userId,
      user.userName || user.email,
      user.clinicId
    );

    socket.on('disconnect', () => {
      socket.leave(clinicRoom);
      socket.leave(userRoom);
      logger.info(`User disconnected: ${user.userId} (socket: ${socket.id})`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialised');
  return io;
}

/** Emit an event scoped to a specific clinic room */
export function emitToClinic(clinicId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`clinic:${clinicId}`).emit(event, data);
}

/** Emit an event scoped to a specific user room */
export function emitToUser(userId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

/** Emit an event scoped to a specific appointment room */
export function emitAppointmentUpdate(
  appointmentId: string,
  event: string,
  data: unknown
): void {
  if (!io) return;
  io.to(`appointment:${appointmentId}`).emit(event, data);
}
