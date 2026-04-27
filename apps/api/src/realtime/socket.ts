import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken, TokenPayload } from '../modules/auth/token.service';

let io: SocketIOServer | null = null;

interface AuthenticatedSocket extends Socket {
  user: TokenPayload;
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.WEB_URL || 'http://localhost:3000',
      credentials: true,
    },
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

    socket.on('disconnect', () => {
      socket.leave(clinicRoom);
      socket.leave(userRoom);
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
