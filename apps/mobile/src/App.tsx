import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from './screens/DashboardScreen';
import { PaymentScreen } from './screens/PaymentScreen';
import { DocumentsScreen } from './screens/DocumentsScreen';
import { CarePlansScreen } from './screens/CarePlansScreen';
import { ImmunizationsScreen } from './screens/ImmunizationsScreen';
import { AppointmentsScreen } from './screens/AppointmentsScreen';
import { AppointmentDetailScreen } from './screens/AppointmentDetailScreen';
import { BookAppointmentScreen } from './screens/BookAppointmentScreen';
import { NotificationService } from './services/notification.service';
import { BiometricService } from './services/biometric.service';
import { NotificationPreferencesScreen } from './screens/NotificationPreferencesScreen';
import { configureSslPinning } from './security/sslPinning';
import { checkDeviceIntegrity, DeviceIntegrity } from './security/deviceIntegrity';

type SecurityState =
  | { status: 'starting' }
  | { status: 'ready'; integrity: DeviceIntegrity }
  | { status: 'failed' };

const securityStyles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, color: '#666', textAlign: 'center' },
});

function SecurityNotice({ title, body }: { title: string; body: string }) {
  return (
    <View style={securityStyles.screen}>
      <Text style={securityStyles.title}>{title}</Text>
      <Text style={securityStyles.body}>{body}</Text>
    </View>
  );
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const linking = {
  prefixes: ['healthwatchers://'],
  config: {
    screens: {
      AppointmentsStack: {
        screens: {
          Appointments: 'appointments',
          AppointmentDetail: 'appointments/:id',
          BookAppointment: 'appointments/book',
        },
      },
      SettingsStack: {
        screens: {
          NotificationPreferences: 'settings/notifications',
        },
      },
    },
  },
};

function DashboardStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Health Dashboard' }}
      />
    </Stack.Navigator>
  );
}

function PaymentStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Payments"
        component={PaymentScreen}
        options={{ title: 'Payments & Invoices' }}
      />
    </Stack.Navigator>
  );
}

function DocumentsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Documents" component={DocumentsScreen} options={{ title: 'Documents' }} />
    </Stack.Navigator>
  );
}

function CarePlansStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CarePlans"
        component={CarePlansScreen}
        options={{ title: 'Care Plans' }}
      />
    </Stack.Navigator>
  );
}

function ImmunizationsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Immunizations"
        component={ImmunizationsScreen}
        options={{ title: 'Immunizations' }}
      />
    </Stack.Navigator>
  );
}

function AppointmentsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Appointments"
        component={AppointmentsScreen}
        options={{ title: 'Appointments' }}
      />
      <Stack.Screen
        name="AppointmentDetail"
        component={AppointmentDetailScreen}
        options={{ title: 'Appointment' }}
      />
      <Stack.Screen
        name="BookAppointment"
        component={BookAppointmentScreen}
        options={{ title: 'Book Appointment' }}
      />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="NotificationPreferences"
        component={NotificationPreferencesScreen}
        options={{ title: 'Notification Preferences' }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [security, setSecurity] = useState<SecurityState>({ status: 'starting' });
  const [biometricChecked, setBiometricChecked] = useState(false);

  useEffect(() => {
    // Pinning must be in place before the first network request (incl. push registration)
    configureSslPinning()
      .then(() => {
        const integrity = checkDeviceIntegrity();
        setSecurity({ status: 'ready', integrity });
        if (integrity.compromised && integrity.policy === 'warn') {
          Alert.alert(
            'Security warning',
            'This device appears to be rooted or jailbroken. Health information stored or ' +
              'shown on it may be exposed to other apps. Use a secure device if you can.'
          );
        }
      })
      .catch((err: unknown) => {
        console.error('[security] SSL pinning setup failed', err);
        setSecurity({ status: 'failed' });
      });
  }, []);

  const blocked =
    security.status === 'ready' &&
    security.integrity.compromised &&
    security.integrity.policy === 'block';
  const ready = security.status === 'ready' && !blocked;

  useEffect(() => {
    if (!ready) return;
    NotificationService.registerForPushNotifications();
    NotificationService.useNotificationListener();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // Returning users with a stored token are prompted for biometrics (Face ID / fingerprint),
    // falling back to PIN/password when biometrics are unavailable or fail.
    BiometricService.authenticateReturningUser()
      .catch((err: unknown) => {
        console.error('[biometrics] startup authentication failed', err);
      })
      .finally(() => {
        if (!cancelled) setBiometricChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (security.status === 'starting') {
    return (
      <View style={securityStyles.screen}>
        <ActivityIndicator />
      </View>
    );
  }

  if (security.status === 'failed') {
    return (
      <SecurityNotice
        title="Secure connection unavailable"
        body="The app could not set up a secure connection. Please update to the latest version."
      />
    );
  }

  if (blocked) {
    return (
      <SecurityNotice
        title="Device not supported"
        body="For your privacy, Health Watchers can't be used on rooted or jailbroken devices."
      />
    );
  }

  if (!biometricChecked) {
    return (
      <View style={securityStyles.screen}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer
      linking={linking}
      onReady={() => {
        // Handle a notification that launched the app (cold start deep link)
        NotificationService.consumeInitialNotification?.();
      }}
    >
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#007AFF',
        }}
      >
        <Tab.Screen
          name="DashboardStack"
          component={DashboardStack}
          options={{
            title: 'Dashboard',
            tabBarLabel: 'Dashboard',
          }}
        />
        <Tab.Screen
          name="PaymentStack"
          component={PaymentStack}
          options={{
            title: 'Payments',
            tabBarLabel: 'Payments',
          }}
        />
        <Tab.Screen
          name="AppointmentsStack"
          component={AppointmentsStack}
          options={{
            title: 'Appointments',
            tabBarLabel: 'Appointments',
          }}
        />
        <Tab.Screen
          name="DocumentsStack"
          component={DocumentsStack}
          options={{
            title: 'Documents',
            tabBarLabel: 'Documents',
          }}
        />
        <Tab.Screen
          name="CarePlansStack"
          component={CarePlansStack}
          options={{
            title: 'Care Plans',
            tabBarLabel: 'Care Plans',
          }}
        />
        <Tab.Screen
          name="ImmunizationsStack"
          component={ImmunizationsStack}
          options={{
            title: 'Immunizations',
            tabBarLabel: 'Immunizations',
          }}
        />
        <Tab.Screen
          name="SettingsStack"
          component={SettingsStack}
          options={{
            title: 'Settings',
            tabBarLabel: 'Settings',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
