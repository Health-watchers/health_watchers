import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const APPOINTMENT_REMINDER_24H_ID = 'appointment-reminder-24h';
export const APPOINTMENT_REMINDER_2H_ID = 'appointment-reminder-2h';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export interface AppointmentReminderInput {
  appointmentId: string;
  startTime: string | Date;
  title?: string;
  body?: string;
}

export type NotificationTapHandler = (data: Record<string, any>) => void;

export class NotificationService {
  static async registerForPushNotifications(): Promise<string | null> {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('appointment-reminders', {
          name: 'Appointment Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      return token;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }

  static async registerDeviceOnLogin(
    apiBaseUrl: string,
    authToken: string
  ): Promise<string | null> {
    const expoPushToken = await NotificationService.registerForPushNotifications();
    if (!expoPushToken) {
      return null;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/users/push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          expoPushToken,
          platform: Platform.OS,
        }),
      });

      if (!response.ok) {
        console.error('Failed to store push token on API:', response.status);
        return null;
      }

      return expoPushToken;
    } catch (error) {
      console.error('Error storing push token on API:', error);
      return null;
    }
  }

  static async scheduleAppointmentReminders(
    appointment: AppointmentReminderInput
  ): Promise<string[]> {
    const startTime = new Date(appointment.startTime).getTime();
    const now = Date.now();
    const scheduledIds: string[] = [];

    const reminders = [
      {
        id: APPOINTMENT_REMINDER_24H_ID,
        offset: TWENTY_FOUR_HOURS_MS,
        title: appointment.title ?? 'Appointment Reminder',
        body:
          appointment.body ??
          'You have an appointment in 24 hours.',
      },
      {
        id: APPOINTMENT_REMINDER_2H_ID,
        offset: TWO_HOURS_MS,
        title: appointment.title ?? 'Appointment Reminder',
        body:
          appointment.body ??
          'You have an appointment in 2 hours.',
      },
    ];

    for (const reminder of reminders) {
      const triggerTime = startTime - reminder.offset;
      if (triggerTime <= now) {
        continue;
      }

      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `${reminder.id}-${appointment.appointmentId}`,
          content: {
            title: reminder.title,
            body: reminder.body,
            sound: 'default',
            data: {
              type: 'appointment',
              appointmentId: appointment.appointmentId,
            },
          },
          trigger: { date: new Date(triggerTime) } as any,
        });
        scheduledIds.push(`${reminder.id}-${appointment.appointmentId}`);
      } catch (error) {
        console.error('Error scheduling appointment reminder:', error);
      }
    }

    return scheduledIds;
  }

  static async cancelAppointmentReminders(
    appointmentId: string
  ): Promise<void> {
    const ids = [
      `${APPOINTMENT_REMINDER_24H_ID}-${appointmentId}`,
      `${APPOINTMENT_REMINDER_2H_ID}-${appointmentId}`,
    ];

    await Promise.all(
      ids.map(async (id) => {
        try {
          await Notifications.cancelScheduledNotificationAsync(id);
        } catch (error) {
          // Notification may not exist; ignore.
        }
      })
    );
  }

  static handleNotificationTap(
    data: Record<string, any> | undefined,
    navigate: NotificationTapHandler
  ): void {
    if (!data) {
      return;
    }

    if (data.appointmentId) {
      navigate({ screen: 'AppointmentDetail', appointmentId: data.appointmentId });
    } else if (data.encounterId) {
      navigate({ screen: 'EncounterDetail', encounterId: data.encounterId });
    } else if (data.labResultId) {
      navigate({ screen: 'LabResultDetail', labResultId: data.labResultId });
    }
  }

  static useNotificationListener(navigate: NotificationTapHandler) {
    useEffect(() => {
      const subscription = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          const data = response.notification.request.content.data;
          NotificationService.handleNotificationTap(data, navigate);
        }
      );

      return () => subscription.remove();
    }, [navigate]);
  }
}
