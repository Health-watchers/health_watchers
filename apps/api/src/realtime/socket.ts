import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyAccessToken } from "../modules/auth/token.service";

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.WEB_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  // JWT authentication middleware
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return next(new Error("Invalid or expired token"));
    }

    // Attach user info to socket for use in handlers
    (socket as any).user = payload;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const user = (socket as any).user;
    const clinicRoom = `clinic:${user.clinicId}`;

    // Join the clinic-scoped room automatically
    socket.join(clinicRoom);

    socket.on("disconnect", () => {
      socket.leave(clinicRoom);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO not initialised");
  return io;
}

/** Emit an event scoped to a specific clinic room */
export function emitToClinic(
  clinicId: string,
  event: string,
  data: unknown
): void {
  getIO().to(`clinic:${clinicId}`).emit(event, data);
}
