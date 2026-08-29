import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export class NotificationService {
  static async registerForPushNotifications(): Promise<string | null> {
    try {
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

  static useNotificationListener() {
    useEffect(() => {
      const subscription = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          const { appointmentId, encounterId, labResultId } =
            response.notification.request.content.data;
          // Handle navigation based on notification type
          if (appointmentId) {
            // Navigate to appointment detail
          } else if (encounterId) {
            // Navigate to encounter detail
          } else if (labResultId) {
            // Navigate to lab result
          }
        }
      );

      return () => subscription.remove();
    }, []);
  }
}
