import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from './screens/DashboardScreen';
import { PaymentScreen } from './screens/PaymentScreen';
import { NotificationService } from './services/notification.service';

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

export default function App() {
  React.useEffect(() => {
    NotificationService.registerForPushNotifications();
    NotificationService.useNotificationListener();
  }, []);

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
      </Tab.Navigator>
    </NavigationContainer>
  );
}
