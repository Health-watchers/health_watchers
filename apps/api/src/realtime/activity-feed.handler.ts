/**
 * Activity Feed Handler
 * Manages real-time activity feed for patient records
 * Issue #1234
 */

import { emitToClinic, emitToUser } from './socket';

export interface ActivityFeedEntry {
  id: string;
  activityType:
    | 'patient_created'
    | 'patient_updated'
    | 'encounter_created'
    | 'encounter_updated'
    | 'note_added'
    | 'appointment_scheduled'
    | 'medication_added'
    | 'lab_result_received'
    | 'allergy_noted'
    | 'document_uploaded';
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

// In-memory activity feed (use database in production)
const activityFeedStore = new Map<string, ActivityFeedEntry[]>();

export class ActivityFeedHandler {
  /**
   * Add activity to patient's feed
   */
  static addActivity(
    patientId: string,
    activity: Omit<ActivityFeedEntry, 'id' | 'timestamp'>
  ): ActivityFeedEntry {
    const entry: ActivityFeedEntry = {
      ...activity,
      id: `activity_${Date.now()}_${Math.random()}`,
      timestamp: new Date(),
    };

    if (!activityFeedStore.has(patientId)) {
      activityFeedStore.set(patientId, []);
    }

    const feed = activityFeedStore.get(patientId)!;
    feed.push(entry);

    // Keep only last 100 entries in memory
    if (feed.length > 100) {
      feed.shift();
    }

    // Broadcast activity
    this.broadcastActivity(patientId, entry, activity.visibility);

    return entry;
  }

  /**
   * Broadcast activity to appropriate users
   */
  private static broadcastActivity(
    patientId: string,
    activity: ActivityFeedEntry,
    visibility: string
  ): void {
    if (visibility === 'clinic') {
      emitToClinic(activity.userId, 'activity:new-entry', activity);
    } else if (visibility === 'private') {
      emitToUser(activity.userId, 'activity:new-entry', activity);
    } else if (visibility === 'team') {
      // In production, broadcast to team members
      emitToClinic(activity.userId, 'activity:new-entry', activity);
    }
  }

  /**
   * Get patient activity feed
   */
  static getPatientActivityFeed(
    patientId: string,
    options: { limit?: number; skip?: number; fromDate?: Date; toDate?: Date } = {}
  ): ActivityFeedEntry[] {
    const feed = activityFeedStore.get(patientId) || [];
    const { limit = 50, skip = 0, fromDate, toDate } = options;

    let filtered = feed;

    // Filter by date range
    if (fromDate || toDate) {
      filtered = filtered.filter((entry) => {
        if (fromDate && entry.timestamp < fromDate) return false;
        if (toDate && entry.timestamp > toDate) return false;
        return true;
      });
    }

    // Sort by timestamp descending (most recent first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    return filtered.slice(skip, skip + limit);
  }

  /**
   * Get activity statistics
   */
  static getActivityStats(patientId: string): {
    totalActivities: number;
    byType: Record<string, number>;
    lastActivityAt?: Date;
  } {
    const feed = activityFeedStore.get(patientId) || [];

    const byType: Record<string, number> = {};
    feed.forEach((entry) => {
      byType[entry.activityType] = (byType[entry.activityType] || 0) + 1;
    });

    return {
      totalActivities: feed.length,
      byType,
      lastActivityAt: feed.length > 0 ? feed[feed.length - 1].timestamp : undefined,
    };
  }

  /**
   * Subscribe to patient activity
   */
  static subscribeToPatientActivity(userId: string, patientId: string): void {
    emitToUser(userId, 'activity:subscribed', {
      patientId,
      timestamp: new Date(),
    });
  }

  /**
   * Unsubscribe from patient activity
   */
  static unsubscribeFromPatientActivity(userId: string, patientId: string): void {
    emitToUser(userId, 'activity:unsubscribed', {
      patientId,
      timestamp: new Date(),
    });
  }

  /**
   * Record common patient activities
   */
  static recordPatientViewed(userId: string, userName: string, patientId: string): void {
    this.addActivity(patientId, {
      activityType: 'patient_created',
      resourceType: 'patient',
      resourceId: patientId,
      patientId,
      userId,
      userName,
      title: 'Patient Record Viewed',
      description: `${userName} viewed the patient record`,
      visibility: 'clinic',
    });
  }

  /**
   * Record encounter created
   */
  static recordEncounterCreated(
    userId: string,
    userName: string,
    patientId: string,
    encounterId: string,
    encounterType: string
  ): void {
    this.addActivity(patientId, {
      activityType: 'encounter_created',
      resourceType: 'encounter',
      resourceId: encounterId,
      patientId,
      userId,
      userName,
      title: 'Encounter Created',
      description: `${userName} created a ${encounterType} encounter`,
      visibility: 'clinic',
      metadata: { encounterType },
    });
  }

  /**
   * Record note added
   */
  static recordNoteAdded(
    userId: string,
    userName: string,
    patientId: string,
    noteId: string,
    noteType: string
  ): void {
    this.addActivity(patientId, {
      activityType: 'note_added',
      resourceType: 'note',
      resourceId: noteId,
      patientId,
      userId,
      userName,
      title: 'Clinical Note Added',
      description: `${userName} added a ${noteType} note`,
      visibility: 'clinic',
      metadata: { noteType },
    });
  }

  /**
   * Record lab result received
   */
  static recordLabResultReceived(
    userId: string,
    userName: string,
    patientId: string,
    testName: string,
    result: string
  ): void {
    this.addActivity(patientId, {
      activityType: 'lab_result_received',
      resourceType: 'lab_result',
      resourceId: `lab_${Date.now()}`,
      patientId,
      userId,
      userName,
      title: 'Lab Result Received',
      description: `${testName}: ${result}`,
      visibility: 'clinic',
      metadata: { testName, result },
    });
  }

  /**
   * Record appointment scheduled
   */
  static recordAppointmentScheduled(
    userId: string,
    userName: string,
    patientId: string,
    appointmentId: string,
    appointmentTime: Date
  ): void {
    this.addActivity(patientId, {
      activityType: 'appointment_scheduled',
      resourceType: 'appointment',
      resourceId: appointmentId,
      patientId,
      userId,
      userName,
      title: 'Appointment Scheduled',
      description: `${userName} scheduled an appointment for ${appointmentTime.toLocaleString()}`,
      visibility: 'clinic',
      metadata: { appointmentTime },
    });
  }

  /**
   * Clear old activities
   */
  static clearOldActivities(patientId: string, olderThanDays: number = 90): void {
    const feed = activityFeedStore.get(patientId);
    if (!feed) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const filtered = feed.filter((entry) => entry.timestamp > cutoffDate);
    activityFeedStore.set(patientId, filtered);
  }
}
