import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { UserModel } from '../modules/auth/models/user.model';
import logger from '../utils/logger';

export class SocketService {
  private io: SocketIOServer;
  private static instance: SocketService;

  private constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
      },
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  public static getInstance(server?: HTTPServer): SocketService {
    if (!SocketService.instance && server) {
      SocketService.instance = new SocketService(server);
    }
    return SocketService.instance;
  }

  private setupMiddleware() {
    // Authentication middleware for Socket.IO
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        const user = await UserModel.findById(decoded.userId).select('-password');
        
        if (!user) {
          return next(new Error('User not found'));
        }

        socket.data.user = user;
        socket.join(`clinic:${user.clinicId}`);
        socket.join(`user:${user._id}`);
        
        logger.info(`Socket connected: ${socket.id} for user ${user._id}`);
        next();
      } catch (error) {
        logger.error({ error }, 'Socket authentication failed');
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });

      // Join specific appointment room for real-time updates
      socket.on('join_appointment', (appointmentId: string) => {
        socket.join(`appointment:${appointmentId}`);
        logger.info(`Socket ${socket.id} joined appointment room: ${appointmentId}`);
      });

      // Leave appointment room
      socket.on('leave_appointment', (appointmentId: string) => {
        socket.leave(`appointment:${appointmentId}`);
        logger.info(`Socket ${socket.id} left appointment room: ${appointmentId}`);
      });
    });
  }

  // Emit appointment status updates
  public emitAppointmentUpdate(appointmentId: string, event: string, data: any) {
    this.io.to(`appointment:${appointmentId}`).emit(event, {
      appointmentId,
      timestamp: new Date().toISOString(),
      ...data,
    });
    
    logger.info(`Emitted ${event} for appointment ${appointmentId}`);
  }

  // Emit to specific clinic
  public emitToClinic(clinicId: string, event: string, data: any) {
    this.io.to(`clinic:${clinicId}`).emit(event, {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  // Emit to specific user
  public emitToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  public getIO(): SocketIOServer {
    return this.io;
  }
}