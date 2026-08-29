/**
 * Notification Handler
 * Sends real-time notifications for data changes
 * Issue #1234
 */

import { emitToClinic, emitToUser } from './socket';

export interface NotificationEvent {
  id: string;
  type: 'data_change' | 'appointment_update' | 'alert' | 'comment' | 'assignment';
  resourceType: string;
  resourceId: string;
  title: string;
  message: string;
  userId: string;
  clinicId: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export class NotificationHandler {
  /**
   * Notify user of data change
   */
  static notifyDataChange(
    userId: string,
    clinicId: string,
    data: {
      resourceType: string;
      resourceId: string;
      action: 'created' | 'updated' | 'deleted';
      title: string;
      message: string;
      changedBy: string;
      metadata?: Record<string, any>;
    }
  ): void {
    const notification: NotificationEvent = {
      id: `notif_${Date.now()}_${Math.random()}`,
      type: 'data_change',
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      title: data.title,
      message: data.message,
      userId,
      clinicId,
      severity: 'info',
      timestamp: new Date(),
      read: false,
      metadata: {
        action: data.action,
        changedBy: data.changedBy,
        ...data.metadata,
      },
    };

    // Emit to specific user
    emitToUser(userId, 'notification:data-change', notification);
  }

  /**
   * Notify clinic of appointment update
   */
  static notifyAppointmentUpdate(
    clinicId: string,
    data: {
      appointmentId: string;
      patientName: string;
      status: string;
      startTime: Date;
      changedBy: string;
      notifyUsers?: string[];
    }
  ): void {
    const notification: NotificationEvent = {
      id: `notif_${Date.now()}_${Math.random()}`,
      type: 'appointment_update',
      resourceType: 'appointment',
      resourceId: data.appointmentId,
      title: 'Appointment Updated',
      message: `Appointment for ${data.patientName} has been ${data.status}`,
      userId: data.changedBy,
      clinicId,
      severity: 'info',
      timestamp: new Date(),
      read: false,
      actionUrl: `/appointments/${data.appointmentId}`,
      metadata: {
        patientName: data.patientName,
        status: data.status,
        startTime: data.startTime,
      },
    };

    // Notify specific users or entire clinic
    if (data.notifyUsers && data.notifyUsers.length > 0) {
      for (const userId of data.notifyUsers) {
        emitToUser(userId, 'notification:appointment-update', notification);
      }
    } else {
      emitToClinic(clinicId, 'notification:appointment-update', notification);
    }
  }

  /**
   * Send alert notification
   */
  static sendAlert(
    clinicId: string,
    data: {
      title: string;
      message: string;
      severity: 'warning' | 'error' | 'critical';
      resourceType?: string;
      resourceId?: string;
      notifyUsers?: string[];
    }
  ): void {
    const notification: NotificationEvent = {
      id: `alert_${Date.now()}_${Math.random()}`,
      type: 'alert',
      resourceType: data.resourceType || 'system',
      resourceId: data.resourceId || '',
      title: data.title,
      message: data.message,
      userId: 'system',
      clinicId,
      severity: data.severity,
      timestamp: new Date(),
      read: false,
    };

    if (data.notifyUsers && data.notifyUsers.length > 0) {
      for (const userId of data.notifyUsers) {
        emitToUser(userId, 'notification:alert', notification);
      }
    } else {
      emitToClinic(clinicId, 'notification:alert', notification);
    }
  }

  /**
   * Notify of real-time appointment reminder
   */
  static notifyAppointmentReminder(
    userId: string,
    clinicId: string,
    data: {
      appointmentId: string;
      patientName: string;
      startTime: Date;
      minutesUntilStart: number;
    }
  ): void {
    const notification: NotificationEvent = {
      id: `reminder_${Date.now()}_${Math.random()}`,
      type: 'alert',
      resourceType: 'appointment',
      resourceId: data.appointmentId,
      title: 'Upcoming Appointment',
      message: `${data.patientName}'s appointment starts in ${data.minutesUntilStart} minutes`,
      userId,
      clinicId,
      severity: data.minutesUntilStart <= 5 ? 'warning' : 'info',
      timestamp: new Date(),
      read: false,
      actionUrl: `/appointments/${data.appointmentId}`,
      metadata: {
        patientName: data.patientName,
        startTime: data.startTime,
        minutesUntilStart: data.minutesUntilStart,
      },
    };

    emitToUser(userId, 'notification:appointment-reminder', notification);
  }

  /**
   * Notify of critical lab result
   */
  static notifyCriticalLabResult(
    clinicId: string,
    userId: string,
    data: {
      patientId: string;
      patientName: string;
      testName: string;
      value: number;
      unit: string;
      normalRange: { min: number; max: number };
    }
  ): void {
    const notification: NotificationEvent = {
      id: `lab_${Date.now()}_${Math.random()}`,
      type: 'alert',
      resourceType: 'lab_result',
      resourceId: data.patientId,
      title: 'Critical Lab Result',
      message: `${data.patientName}: ${data.testName} = ${data.value} ${data.unit} (abnormal)`,
      userId,
      clinicId,
      severity: 'critical',
      timestamp: new Date(),
      read: false,
      actionUrl: `/patients/${data.patientId}/results`,
      metadata: {
        patientName: data.patientName,
        testName: data.testName,
        value: data.value,
        unit: data.unit,
        normalRange: data.normalRange,
      },
    };

    emitToUser(userId, 'notification:critical-result', notification);
  }

  /**
   * Mark notification as read
   */
  static markAsRead(userId: string, notificationId: string): void {
    // In production, persist to database
    emitToUser(userId, 'notification:marked-read', { notificationId });
  }

  /**
   * Clear all notifications for user
   */
  static clearNotifications(userId: string): void {
    emitToUser(userId, 'notification:cleared', { timestamp: new Date() });
  }
}
