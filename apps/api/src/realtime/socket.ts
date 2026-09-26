import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken, TokenPayload } from '../modules/auth/token.service';
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

  // JWT authentication middleware
  io.use((socket: Socket, next: (err?: Error) => void) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const payload = verifyAccessToken(token);
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
