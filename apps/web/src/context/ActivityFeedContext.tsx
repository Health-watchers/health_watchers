/**
 * Activity Feed Context
 * Manages real-time activity feed for patient records
 * Issue #1234
 */

import React, { createContext, useCallback, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from '@web/lib/socket';

export interface ActivityEntry {
  id: string;
  activityType: string;
  resourceType: string;
  resourceId: string;
  patientId: string;
  userId: string;
  userName: string;
  title: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  visibility: 'private' | 'clinic' | 'team';
}

interface ActivityFeedContextType {
  activities: Map<string, ActivityEntry[]>;
  getPatientActivities: (patientId: string) => ActivityEntry[];
  subscribeToPatient: (patientId: string) => void;
  unsubscribeFromPatient: (patientId: string) => void;
  getActivityStats: (patientId: string) => { total: number; byType: Record<string, number> };
}

const ActivityFeedContext = createContext<ActivityFeedContextType | undefined>(undefined);

export function ActivityFeedProvider({
  children,
  token,
}: {
  children: React.ReactNode;
  token?: string;
}) {
  const { socket } = useSocket(token);
  const [activities, setActivities] = useState<Map<string, ActivityEntry[]>>(new Map());
  const [subscribedPatients, setSubscribedPatients] = useState<Set<string>>(new Set());

  // Listen for activity updates
  useEffect(() => {
    if (!socket) return;

    const handleNewActivity = (activity: ActivityEntry) => {
      setActivities((prev) => {
        const map = new Map(prev);
        const patientActivities = map.get(activity.patientId) || [];

        // Add new activity to beginning (most recent first)
        const updated = [activity, ...patientActivities].slice(0, 100);
        map.set(activity.patientId, updated);

        return map;
      });
    };

    const handleSubscribed = (data: any) => {
      setSubscribedPatients((prev) => new Set([...prev, data.patientId]));
    };

    const handleUnsubscribed = (data: any) => {
      setSubscribedPatients((prev) => {
        const set = new Set(prev);
        set.delete(data.patientId);
        return set;
      });
    };

    socket.on('activity:new-entry', handleNewActivity);
    socket.on('activity:subscribed', handleSubscribed);
    socket.on('activity:unsubscribed', handleUnsubscribed);

    return () => {
      socket.off('activity:new-entry', handleNewActivity);
      socket.off('activity:subscribed', handleSubscribed);
      socket.off('activity:unsubscribed', handleUnsubscribed);
    };
  }, [socket]);

  const getPatientActivities = useCallback(
    (patientId: string): ActivityEntry[] => {
      return activities.get(patientId) || [];
    },
    [activities]
  );

  const subscribeToPatient = useCallback(
    (patientId: string) => {
      if (!subscribedPatients.has(patientId)) {
        setSubscribedPatients((prev) => new Set([...prev, patientId]));
        if (socket?.connected) {
          socket.emit('activity:subscribe', { patientId });
        }
      }
    },
    [socket, subscribedPatients]
  );

  const unsubscribeFromPatient = useCallback(
    (patientId: string) => {
      if (subscribedPatients.has(patientId)) {
        setSubscribedPatients((prev) => {
          const set = new Set(prev);
          set.delete(patientId);
          return set;
        });
        if (socket?.connected) {
          socket.emit('activity:unsubscribe', { patientId });
        }
      }
    },
    [socket, subscribedPatients]
  );

  const getActivityStats = useCallback(
    (patientId: string) => {
      const patientActivities = activities.get(patientId) || [];
      const byType: Record<string, number> = {};

      patientActivities.forEach((activity) => {
        byType[activity.activityType] = (byType[activity.activityType] || 0) + 1;
      });

      return {
        total: patientActivities.length,
        byType,
      };
    },
    [activities]
  );

  const value: ActivityFeedContextType = {
    activities,
    getPatientActivities,
    subscribeToPatient,
    unsubscribeFromPatient,
    getActivityStats,
  };

  return <ActivityFeedContext.Provider value={value}>{children}</ActivityFeedContext.Provider>;
}

export function useActivityFeed() {
  const context = React.useContext(ActivityFeedContext);
  if (!context) {
    throw new Error('useActivityFeed must be used within ActivityFeedProvider');
  }
  return context;
}
