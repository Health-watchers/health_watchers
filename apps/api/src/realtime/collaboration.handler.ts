/**
 * Collaboration WebSocket Handler
 * Manages real-time collaborative editing and presence
 * Issue #1234
 */

import { Socket } from 'socket.io';
import { getIO, emitToClinic, emitToUser } from './socket';
import { auditLog } from '../modules/audit/audit.service';

interface PresenceInfo {
  userId: string;
  userName: string;
  resourceId: string;
  resourceType: string;
  cursorPosition?: { line: number; column: number };
  selectionRange?: { start: number; end: number };
  color: string;
  lastActivity: Date;
}

interface EditOperation {
  id: string;
  userId: string;
  resourceId: string;
  type: 'insert' | 'delete' | 'replace';
  position: number;
  content?: string;
  length?: number;
  timestamp: Date;
  version: number;
}

// In-memory storage for active editing sessions (use Redis in production)
const activeEditingSessions = new Map<string, Map<string, PresenceInfo>>();
const editOperationHistory = new Map<string, EditOperation[]>();
const documentVersions = new Map<string, number>();

export class CollaborationHandler {
  /**
   * Register collaboration event handlers
   */
  static registerHandlers(socket: Socket, userId: string, userName: string): void {
    socket.on('collaboration:start-editing', (data) => {
      this.handleStartEditing(socket, userId, userName, data);
    });

    socket.on('collaboration:stop-editing', (data) => {
      this.handleStopEditing(socket, userId, data);
    });

    socket.on('collaboration:cursor-move', (data) => {
      this.handleCursorMove(socket, userId, data);
    });

    socket.on('collaboration:edit-operation', (data) => {
      this.handleEditOperation(socket, userId, data);
    });

    socket.on('collaboration:request-sync', (data) => {
      this.handleRequestSync(socket, userId, data);
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket, userId);
    });
  }

  /**
   * Handle user starting to edit a resource
   */
  private static handleStartEditing(
    socket: Socket,
    userId: string,
    userName: string,
    data: { resourceId: string; resourceType: string; color: string }
  ): void {
    const { resourceId, resourceType, color } = data;
    const sessionKey = `${resourceType}:${resourceId}`;

    if (!activeEditingSessions.has(sessionKey)) {
      activeEditingSessions.set(sessionKey, new Map());
      documentVersions.set(sessionKey, 0);
    }

    const session = activeEditingSessions.get(sessionKey)!;
    session.set(userId, {
      userId,
      userName,
      resourceId,
      resourceType,
      color,
      lastActivity: new Date(),
    });

    // Notify others in the clinic
    emitToClinic((socket as any).user.clinicId, 'collaboration:user-joined', {
      userId,
      userName,
      resourceId,
      resourceType,
      color,
      activeUsers: Array.from(session.values()).map((p) => ({
        userId: p.userId,
        userName: p.userName,
        color: p.color,
      })),
    });
  }

  /**
   * Handle user stopping editing
   */
  private static handleStopEditing(
    socket: Socket,
    userId: string,
    data: { resourceId: string; resourceType: string }
  ): void {
    const { resourceId, resourceType } = data;
    const sessionKey = `${resourceType}:${resourceId}`;

    const session = activeEditingSessions.get(sessionKey);
    if (session) {
      session.delete(userId);

      // Notify others
      emitToClinic((socket as any).user.clinicId, 'collaboration:user-left', {
        userId,
        resourceId,
        resourceType,
        activeUsers: Array.from(session.values()).map((p) => ({
          userId: p.userId,
          userName: p.userName,
          color: p.color,
        })),
      });

      // Clean up empty sessions
      if (session.size === 0) {
        activeEditingSessions.delete(sessionKey);
      }
    }
  }

  /**
   * Handle cursor position update
   */
  private static handleCursorMove(
    socket: Socket,
    userId: string,
    data: {
      resourceId: string;
      resourceType: string;
      cursorPosition: { line: number; column: number };
      selectionRange?: { start: number; end: number };
    }
  ): void {
    const { resourceId, resourceType, cursorPosition, selectionRange } = data;
    const sessionKey = `${resourceType}:${resourceId}`;

    const session = activeEditingSessions.get(sessionKey);
    if (session && session.has(userId)) {
      const presence = session.get(userId)!;
      presence.cursorPosition = cursorPosition;
      presence.selectionRange = selectionRange;
      presence.lastActivity = new Date();

      // Broadcast cursor position to other editors
      emitToClinic((socket as any).user.clinicId, 'collaboration:cursor-update', {
        userId,
        resourceId,
        resourceType,
        cursorPosition,
        selectionRange,
      });
    }
  }

  /**
   * Handle edit operation (Operational Transformation)
   */
  private static handleEditOperation(
    socket: Socket,
    userId: string,
    data: {
      resourceId: string;
      resourceType: string;
      operation: EditOperation;
    }
  ): void {
    const { resourceId, resourceType, operation } = data;
    const sessionKey = `${resourceType}:${resourceId}`;

    // Update operation version
    const currentVersion = documentVersions.get(sessionKey) || 0;
    operation.version = currentVersion + 1;
    operation.timestamp = new Date();

    // Store operation
    if (!editOperationHistory.has(sessionKey)) {
      editOperationHistory.set(sessionKey, []);
    }
    editOperationHistory.get(sessionKey)!.push(operation);

    // Update document version
    documentVersions.set(sessionKey, operation.version);

    // Broadcast operation to all collaborators
    emitToClinic((socket as any).user.clinicId, 'collaboration:edit-operation', {
      resourceId,
      resourceType,
      operation,
    });

    // Audit log the change
    auditLog({
      userId,
      action: `${resourceType.toUpperCase()}_UPDATE`,
      resourceType,
      resourceId,
      metadata: {
        operationType: operation.type,
        position: operation.position,
      },
    });
  }

  /**
   * Handle sync request (for late-joining users)
   */
  private static handleRequestSync(
    socket: Socket,
    userId: string,
    data: { resourceId: string; resourceType: string }
  ): void {
    const { resourceId, resourceType } = data;
    const sessionKey = `${resourceType}:${resourceId}`;

    // Send operation history and current state
    const operations = editOperationHistory.get(sessionKey) || [];
    const version = documentVersions.get(sessionKey) || 0;
    const presence = Array.from(activeEditingSessions.get(sessionKey)?.values() || []).map(
      (p) => ({
        userId: p.userId,
        userName: p.userName,
        color: p.color,
        cursorPosition: p.cursorPosition,
      })
    );

    socket.emit('collaboration:sync', {
      resourceId,
      resourceType,
      operations,
      version,
      presence,
    });
  }

  /**
   * Handle user disconnect
   */
  private static handleDisconnect(socket: Socket, userId: string): void {
    // Remove user from all active editing sessions
    for (const [sessionKey, session] of activeEditingSessions.entries()) {
      if (session.has(userId)) {
        session.delete(userId);

        const [resourceType, resourceId] = sessionKey.split(':');
        emitToClinic((socket as any).user.clinicId, 'collaboration:user-left', {
          userId,
          resourceId,
          resourceType,
          activeUsers: Array.from(session.values()).map((p) => ({
            userId: p.userId,
            userName: p.userName,
            color: p.color,
          })),
        });

        if (session.size === 0) {
          activeEditingSessions.delete(sessionKey);
        }
      }
    }
  }

  /**
   * Get active users editing a resource
   */
  static getActiveUsers(resourceType: string, resourceId: string): PresenceInfo[] {
    const sessionKey = `${resourceType}:${resourceId}`;
    const session = activeEditingSessions.get(sessionKey);
    return session ? Array.from(session.values()) : [];
  }

  /**
   * Get operation history for a resource
   */
  static getOperationHistory(resourceType: string, resourceId: string): EditOperation[] {
    const sessionKey = `${resourceType}:${resourceId}`;
    return editOperationHistory.get(sessionKey) || [];
  }
}
