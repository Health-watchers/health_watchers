/**
 * Presence Handler
 * Manages user presence and activity status
 * Issue #1234
 */

import { Socket } from 'socket.io';
import { getIO, emitToClinic } from './socket';

interface UserPresence {
  userId: string;
  userName: string;
  clinicId: string;
  status: 'online' | 'idle' | 'offline';
  lastSeen: Date;
  currentResource?: { type: string; id: string };
  socketId: string;
}

// In-memory presence store (use Redis in production)
const presenceMap = new Map<string, UserPresence>();

export class PresenceHandler {
  /**
   * Register presence event handlers
   */
  static registerHandlers(
    socket: Socket,
    userId: string,
    userName: string,
    clinicId: string
  ): void {
    presenceMap.set(userId, {
      userId,
      userName,
      clinicId,
      status: 'online',
      lastSeen: new Date(),
      socketId: socket.id,
    });

    // Broadcast user came online
    emitToClinic(clinicId, 'presence:user-online', {
      userId,
      userName,
      timestamp: new Date(),
    });

    // Listen for status changes
    socket.on('presence:status-change', (data) => {
      this.handleStatusChange(userId, clinicId, data);
    });

    socket.on('presence:activity', (data) => {
      this.handleActivity(userId, clinicId, data);
    });

    socket.on('presence:request-list', () => {
      this.handleRequestList(socket, clinicId);
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(userId, clinicId);
    });
  }

  /**
   * Handle status change
   */
  private static handleStatusChange(
    userId: string,
    clinicId: string,
    data: { status: 'online' | 'idle' | 'away' | 'offline' }
  ): void {
    const presence = presenceMap.get(userId);
    if (presence) {
      presence.status = data.status;
      presence.lastSeen = new Date();

      emitToClinic(clinicId, 'presence:status-changed', {
        userId,
        status: data.status,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle user activity (viewing/editing resource)
   */
  private static handleActivity(
    userId: string,
    clinicId: string,
    data: { resourceType: string; resourceId: string }
  ): void {
    const presence = presenceMap.get(userId);
    if (presence) {
      presence.currentResource = {
        type: data.resourceType,
        id: data.resourceId,
      };
      presence.lastSeen = new Date();
      presence.status = 'online';

      emitToClinic(clinicId, 'presence:activity', {
        userId,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle request for presence list
   */
  private static handleRequestList(socket: Socket, clinicId: string): void {
    const clinicUsers = Array.from(presenceMap.values())
      .filter((p) => p.clinicId === clinicId && p.status !== 'offline')
      .map((p) => ({
        userId: p.userId,
        userName: p.userName,
        status: p.status,
        lastSeen: p.lastSeen,
        currentResource: p.currentResource,
      }));

    socket.emit('presence:list', { users: clinicUsers });
  }

  /**
   * Handle user disconnect
   */
  private static handleDisconnect(userId: string, clinicId: string): void {
    const presence = presenceMap.get(userId);
    if (presence) {
      presence.status = 'offline';
      presence.lastSeen = new Date();

      emitToClinic(clinicId, 'presence:user-offline', {
        userId,
        timestamp: new Date(),
      });

      // Remove after delay to allow reconnection
      setTimeout(() => {
        if (presenceMap.get(userId)?.status === 'offline') {
          presenceMap.delete(userId);
        }
      }, 30000); // 30 seconds
    }
  }

  /**
   * Get online users in clinic
   */
  static getOnlineUsersInClinic(clinicId: string): UserPresence[] {
    return Array.from(presenceMap.values()).filter(
      (p) => p.clinicId === clinicId && p.status !== 'offline'
    );
  }

  /**
   * Get user presence
   */
  static getUserPresence(userId: string): UserPresence | undefined {
    return presenceMap.get(userId);
  }

  /**
   * Broadcast presence to clinic
   */
  static broadcastPresence(clinicId: string): void {
    const users = this.getOnlineUsersInClinic(clinicId);
    emitToClinic(clinicId, 'presence:updated', {
      users: users.map((p) => ({
        userId: p.userId,
        userName: p.userName,
        status: p.status,
        lastSeen: p.lastSeen,
        currentResource: p.currentResource,
      })),
      timestamp: new Date(),
    });
  }
}
