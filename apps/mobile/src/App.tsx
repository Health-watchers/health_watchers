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
import { NotificationService } from './services/notification.service';
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

export default function App() {
  const [security, setSecurity] = useState<SecurityState>({ status: 'starting' });

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

  return (
    <NavigationContainer>
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
      </Tab.Navigator>
    </NavigationContainer>
  );
}
