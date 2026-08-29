/**
 * Notification Context
 * Manages real-time notifications
 * Issue #1234
 */

import React, { createContext, useCallback, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from '@web/lib/socket';

export interface Notification {
  id: string;
  type: 'data_change' | 'appointment_update' | 'alert' | 'comment' | 'assignment';
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children, token }: { children: React.ReactNode; token?: string }) {
  const { socket } = useSocket(token);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Listen for real-time notifications
  useEffect(() => {
    if (!socket) return;

    const handleNotification = (event: string, data: any) => {
      const notification: Notification = {
        id: data.id || `notif_${Date.now()}`,
        type: data.type,
        title: data.title,
        message: data.message,
        severity: data.severity || 'info',
        timestamp: new Date(data.timestamp),
        read: false,
        actionUrl: data.actionUrl,
        metadata: data.metadata,
      };

      setNotifications((prev) => [notification, ...prev].slice(0, 100)); // Keep last 100
    };

    const handleMarkedRead = (data: any) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === data.notificationId ? { ...n, read: true } : n))
      );
    };

    const handleCleared = () => {
      setNotifications([]);
    };

    socket.on('notification:data-change', (data) => handleNotification('data-change', data));
    socket.on('notification:appointment-update', (data) => handleNotification('appointment-update', data));
    socket.on('notification:alert', (data) => handleNotification('alert', data));
    socket.on('notification:appointment-reminder', (data) => handleNotification('appointment-reminder', data));
    socket.on('notification:critical-result', (data) => handleNotification('critical-result', data));
    socket.on('notification:marked-read', handleMarkedRead);
    socket.on('notification:cleared', handleCleared);

    return () => {
      socket.off('notification:data-change', (data) => handleNotification('data-change', data));
      socket.off('notification:appointment-update', (data) => handleNotification('appointment-update', data));
      socket.off('notification:alert', (data) => handleNotification('alert', data));
      socket.off('notification:appointment-reminder', (data) => handleNotification('appointment-reminder', data));
      socket.off('notification:critical-result', (data) => handleNotification('critical-result', data));
      socket.off('notification:marked-read', handleMarkedRead);
      socket.off('notification:cleared', handleCleared);
    };
  }, [socket]);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
      const newNotification: Notification = {
        ...notification,
        id: `notif_${Date.now()}`,
        timestamp: new Date(),
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev].slice(0, 100));
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    if (socket?.connected) {
      socket.emit('notification:mark-read', { notificationId: id });
    }
  }, [socket]);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    if (socket?.connected) {
      socket.emit('notification:clear-all');
    }
  }, [socket]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    addNotification,
    removeNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
