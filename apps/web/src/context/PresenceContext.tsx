/**
 * Presence Context
 * Manages user presence and real-time status
 * Issue #1234
 */

import React, { createContext, useCallback, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from '@web/lib/socket';

interface UserPresence {
  userId: string;
  userName: string;
  status: 'online' | 'idle' | 'offline';
  lastSeen: Date;
  currentResource?: { type: string; id: string };
}

interface PresenceContextType {
  onlineUsers: Map<string, UserPresence>;
  userStatus: 'online' | 'idle' | 'away' | 'offline';
  setUserStatus: (status: 'online' | 'idle' | 'away' | 'offline') => void;
  getOnlineUserCount: () => number;
  isUserOnline: (userId: string) => boolean;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export function PresenceProvider({
  children,
  token,
}: {
  children: React.ReactNode;
  token?: string;
}) {
  const { socket } = useSocket(token);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, UserPresence>>(new Map());
  const [userStatus, setUserStatusLocal] = useState<'online' | 'idle' | 'away' | 'offline'>(
    'online'
  );
  const inactivityTimeout = React.useRef<NodeJS.Timeout>();

  // Listen for presence updates
  useEffect(() => {
    if (!socket) return;

    const handleUserOnline = (data: any) => {
      setOnlineUsers((prev) => {
        const map = new Map(prev);
        map.set(data.userId, {
          userId: data.userId,
          userName: data.userName,
          status: 'online',
          lastSeen: new Date(),
          currentResource: data.currentResource,
        });
        return map;
      });
    };

    const handleUserOffline = (data: any) => {
      setOnlineUsers((prev) => {
        const map = new Map(prev);
        map.delete(data.userId);
        return map;
      });
    };

    const handleStatusChanged = (data: any) => {
      setOnlineUsers((prev) => {
        const map = new Map(prev);
        const user = map.get(data.userId);
        if (user) {
          user.status = data.status;
          user.lastSeen = new Date();
        }
        return map;
      });
    };

    const handleActivity = (data: any) => {
      setOnlineUsers((prev) => {
        const map = new Map(prev);
        const user = map.get(data.userId);
        if (user) {
          user.currentResource = {
            type: data.resourceType,
            id: data.resourceId,
          };
          user.lastSeen = new Date();
        }
        return map;
      });
    };

    const handlePresenceList = (data: any) => {
      const map = new Map<string, UserPresence>();
      data.users.forEach((user: UserPresence) => {
        map.set(user.userId, user);
      });
      setOnlineUsers(map);
    };

    socket.on('presence:user-online', handleUserOnline);
    socket.on('presence:user-offline', handleUserOffline);
    socket.on('presence:status-changed', handleStatusChanged);
    socket.on('presence:activity', handleActivity);
    socket.on('presence:list', handlePresenceList);

    return () => {
      socket.off('presence:user-online', handleUserOnline);
      socket.off('presence:user-offline', handleUserOffline);
      socket.off('presence:status-changed', handleStatusChanged);
      socket.off('presence:activity', handleActivity);
      socket.off('presence:list', handlePresenceList);
    };
  }, [socket]);

  // Handle inactivity for idle status
  useEffect(() => {
    const handleUserActivity = () => {
      if (userStatus === 'idle' || userStatus === 'away') {
        setUserStatus('online');
      }

      // Reset inactivity timer
      if (inactivityTimeout.current) {
        clearTimeout(inactivityTimeout.current);
      }

      inactivityTimeout.current = setTimeout(
        () => {
          setUserStatus('idle');
        },
        5 * 60 * 1000
      ); // 5 minutes
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keypress', handleUserActivity);
    window.addEventListener('click', handleUserActivity);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keypress', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      if (inactivityTimeout.current) {
        clearTimeout(inactivityTimeout.current);
      }
    };
  }, [userStatus]);

  const setUserStatus = useCallback(
    (status: 'online' | 'idle' | 'away' | 'offline') => {
      setUserStatusLocal(status);
      if (socket?.connected) {
        socket.emit('presence:status-change', { status });
      }
    },
    [socket]
  );

  const getOnlineUserCount = useCallback(() => {
    return onlineUsers.size;
  }, [onlineUsers]);

  const isUserOnline = useCallback(
    (userId: string) => {
      const user = onlineUsers.get(userId);
      return user && user.status !== 'offline';
    },
    [onlineUsers]
  );

  const value: PresenceContextType = {
    onlineUsers,
    userStatus,
    setUserStatus,
    getOnlineUserCount,
    isUserOnline,
  };

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  const context = React.useContext(PresenceContext);
  if (!context) {
    throw new Error('usePresence must be used within PresenceProvider');
  }
  return context;
}
