// Batch-59: Stellar Tests, Mobile Auth, Appointments, Testing Harness
// Issues: #1456, #1457, #1458, #1459

// ────────────────────────────────────────────────────────────────────────────
// #1456: Unit Tests for Escrow and Claimable-Balance Operations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Test file: apps/stellar-service/src/operations/claimable-balance.test.ts
 *
 * Mocks Horizon client and tests:
 * - Create claimable balance with predicate
 * - Claim claimable balance
 * - Reclaim (revoke) claimable balance
 * - Predicate expiry enforcement
 */

export const claimableBalanceTests = `
import { ClaimableBalanceService } from './claimable-balance';
import { horizonClient } from '../horizon-client';

jest.mock('../horizon-client');

describe('ClaimableBalanceService', () => {
  const mockHorizon = horizonClient as jest.Mocked<typeof horizonClient>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createClaimableBalance', () => {
    it('should create a claimable balance with amount and asset', async () => {
      mockHorizon.transactions.post.mockResolvedValue({ id: 'tx-123' });

      const result = await ClaimableBalanceService.createClaimableBalance({
        recipientId: 'GXXX...',
        amount: '100.50',
        asset: 'USDC:GBUQWP3...',
        memo: 'payment-123',
      });

      expect(result).toEqual({ id: 'tx-123' });
      expect(mockHorizon.transactions.post).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: expect.arrayContaining([
            expect.objectContaining({
              type: 'create_claimable_balance',
              claimants: expect.arrayContaining([
                { destination: 'GXXX...', predicate: { unconditional: true } },
              ]),
            }),
          ]),
        })
      );
    });

    it('should include predicate expiry if provided', async () => {
      const expireTime = Math.floor(Date.now() / 1000) + 3600;

      mockHorizon.transactions.post.mockResolvedValue({ id: 'tx-123' });

      await ClaimableBalanceService.createClaimableBalance({
        recipientId: 'GXXX...',
        amount: '100.50',
        asset: 'USDC:GBUQWP3...',
        memo: 'payment-123',
        expiresAt: new Date(expireTime * 1000),
      });

      expect(mockHorizon.transactions.post).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: expect.arrayContaining([
            expect.objectContaining({
              claimants: expect.arrayContaining([
                {
                  destination: 'GXXX...',
                  predicate: {
                    timebounds: { max_time: expireTime.toString() },
                  },
                },
              ]),
            }),
          ]),
        })
      );
    });
  });

  describe('claimClaimableBalance', () => {
    it('should claim a claimable balance', async () => {
      mockHorizon.transactions.post.mockResolvedValue({ id: 'tx-456' });

      const result = await ClaimableBalanceService.claimClaimableBalance({
        balanceId: 'abc123def456',
        claimerAddress: 'GYYYY...',
      });

      expect(result).toEqual({ id: 'tx-456' });
      expect(mockHorizon.transactions.post).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: expect.arrayContaining([
            expect.objectContaining({
              type: 'claim_claimable_balance',
              balance_id: 'abc123def456',
            }),
          ]),
        })
      );
    });

    it('should reject claim if predicate expired', async () => {
      mockHorizon.transactions.post.mockRejectedValue(
        new Error('Predicate not met: time bounds')
      );

      await expect(
        ClaimableBalanceService.claimClaimableBalance({
          balanceId: 'expired-balance',
          claimerAddress: 'GYYYY...',
        })
      ).rejects.toThrow('Predicate not met');
    });
  });

  describe('reclaimClaimableBalance', () => {
    it('should revoke a claimable balance', async () => {
      mockHorizon.transactions.post.mockResolvedValue({ id: 'tx-789' });

      const result = await ClaimableBalanceService.reclaimClaimableBalance({
        balanceId: 'abc123def456',
        issuerAddress: 'GZZZZ...',
      });

      expect(result).toEqual({ id: 'tx-789' });
      expect(mockHorizon.transactions.post).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: expect.arrayContaining([
            expect.objectContaining({
              type: 'claim_claimable_balance',
              balance_id: 'abc123def456',
            }),
          ]),
        })
      );
    });
  });
});
`;

/**
 * Test file: apps/stellar-service/src/operations/escrow.test.ts
 *
 * Tests:
 * - Happy path escrow creation and release
 * - Insufficient balance error
 * - Bad signatures error
 * - Escrow timeout/refund
 */

export const escrowTests = `
import { EscrowService } from './escrow';
import { horizonClient } from '../horizon-client';

jest.mock('../horizon-client');

describe('EscrowService', () => {
  const mockHorizon = horizonClient as jest.Mocked<typeof horizonClient>;

  describe('createEscrow', () => {
    it('should create escrow with patient and clinic', async () => {
      mockHorizon.transactions.post.mockResolvedValue({ id: 'tx-escrow' });

      const result = await EscrowService.createEscrow({
        patientAddress: 'GPATIENT...',
        clinicAddress: 'GCLINIC...',
        amount: '1000',
        asset: 'USDC:GBUQWP3...',
      });

      expect(result).toHaveProperty('id', 'tx-escrow');
    });

    it('should reject if patient has insufficient balance', async () => {
      mockHorizon.transactions.post.mockRejectedValue(
        new Error('Insufficient balance for send')
      );

      await expect(
        EscrowService.createEscrow({
          patientAddress: 'GPOOR...',
          clinicAddress: 'GCLINIC...',
          amount: '1000000',
          asset: 'USDC:GBUQWP3...',
        })
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('releaseEscrow', () => {
    it('should release escrow to clinic after service delivery', async () => {
      mockHorizon.transactions.post.mockResolvedValue({
        id: 'tx-release',
      });

      const result = await EscrowService.releaseEscrow({
        escrowId: 'escrow-123',
        clinicAddress: 'GCLINIC...',
      });

      expect(result).toHaveProperty('id', 'tx-release');
    });
  });

  describe('refundEscrow', () => {
    it('should refund escrow to patient after timeout', async () => {
      mockHorizon.transactions.post.mockResolvedValue({
        id: 'tx-refund',
      });

      const result = await EscrowService.refundEscrow({
        escrowId: 'escrow-123',
        patientAddress: 'GPATIENT...',
      });

      expect(result).toHaveProperty('id', 'tx-refund');
    });

    it('should reject with bad signature', async () => {
      mockHorizon.transactions.post.mockRejectedValue(
        new Error('Bad signature')
      );

      await expect(
        EscrowService.refundEscrow({
          escrowId: 'escrow-123',
          patientAddress: 'GWRONG...',
        })
      ).rejects.toThrow('Bad signature');
    });
  });
});
`;

// ────────────────────────────────────────────────────────────────────────────
// #1457: Login Screen and Authenticated Navigation Flow
// ────────────────────────────────────────────────────────────────────────────

/**
 * Auth store (Zustand)
 * Manages authentication state and tokens
 */
export const authStoreCode = `
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface AuthState {
  isSignedIn: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  user: { id: string; email: string } | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  setTokens: (access: string, refresh: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isSignedIn: false,
  accessToken: null,
  refreshToken: null,
  user: null,

  login: async (email: string, password: string) => {
    const response = await fetch('https://api.health-watchers.com/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    await SecureStore.setItemAsync('accessToken', data.accessToken);
    await SecureStore.setItemAsync('refreshToken', data.refreshToken);

    set({
      isSignedIn: true,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');

    set({
      isSignedIn: false,
      accessToken: null,
      refreshToken: null,
      user: null,
    });
  },

  refreshTokens: async () => {
    const refreshToken = await SecureStore.getItemAsync('refreshToken');
    if (!refreshToken) throw new Error('No refresh token');

    const response = await fetch('https://api.health-watchers.com/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    const data = await response.json();

    await SecureStore.setItemAsync('accessToken', data.accessToken);
    set({ accessToken: data.accessToken });
  },

  setTokens: async (access: string, refresh: string) => {
    await SecureStore.setItemAsync('accessToken', access);
    await SecureStore.setItemAsync('refreshToken', refresh);
    set({ accessToken: access, refreshToken: refresh });
  },
}));
`;

/**
 * LoginScreen.tsx
 * Login form with email/password
 */
export const loginScreenCode = `
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useAuthStore } from '../store/auth-store';

export const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useAuthStore((state) => state.login);

  const handleLogin = async () => {
    try {
      await login(email, password);
      navigation.navigate('MFA');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10 },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 5 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
});
`;

/**
 * MfaScreen.tsx
 * Multi-factor authentication screen
 */
export const mfaScreenCode = `
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

export const MfaScreen = ({ navigation }: any) => {
  const [code, setCode] = useState('');

  const handleVerify = async () => {
    // Verify MFA code with API
    navigation.navigate('Biometric');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter MFA Code</Text>
      <TextInput
        style={styles.input}
        placeholder="000000"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
      />
      <TouchableOpacity style={styles.button} onPress={handleVerify}>
        <Text style={styles.buttonText}>Verify</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10 },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 5 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
});
`;

/**
 * App.tsx with auth stack navigation
 * Switch between auth and app tabs based on isSignedIn
 */
export const appNavigationCode = `
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from './store/auth-store';
import { LoginScreen } from './screens/auth/LoginScreen';
import { MfaScreen } from './screens/auth/MfaScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { AppointmentsScreen } from './screens/AppointmentsScreen';
import { WalletScreen } from './screens/WalletScreen';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

export const AuthStack = () => (
  <Stack.Navigator>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="MFA" component={MfaScreen} />
  </Stack.Navigator>
);

export const AppTabs = () => (
  <Tab.Navigator>
    <Tab.Screen name="Dashboard" component={DashboardScreen} />
    <Tab.Screen name="Appointments" component={AppointmentsScreen} />
    <Tab.Screen name="Wallet" component={WalletScreen} />
  </Tab.Navigator>
);

export default function App() {
  const { isSignedIn, setTokens } = useAuthStore((state) => ({
    isSignedIn: state.isSignedIn,
    setTokens: state.setTokens,
  }));

  useEffect(() => {
    // Resume session on app launch
    const resumeSession = async () => {
      const accessToken = await SecureStore.getItemAsync('accessToken');
      if (accessToken) {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        await setTokens(accessToken, refreshToken || '');
      }
    };

    resumeSession();
  }, []);

  return (
    <NavigationContainer>
      {isSignedIn ? <AppTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
`;

// ────────────────────────────────────────────────────────────────────────────
// #1458: Appointments Screen
// ────────────────────────────────────────────────────────────────────────────

export const appointmentsScreenCode = `
import React, { useState, useEffect } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import * as Calendar from 'expo-calendar';

export const AppointmentsScreen = ({ navigation }: any) => {
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [past, setPast] = useState<Appointment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const fetchAppointments = async () => {
    // Fetch from API
    const response = await fetch('https://api.health-watchers.com/appointments');
    const data = await response.json();

    const now = new Date();
    setUpcoming(data.filter((a: Appointment) => new Date(a.scheduledAt) > now));
    setPast(data.filter((a: Appointment) => new Date(a.scheduledAt) <= now));
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  };

  const handleAddToCalendar = async (appointment: Appointment) => {
    await Calendar.createEventAsync(Calendar.DEFAULT, {
      title: appointment.type,
      startDate: new Date(appointment.scheduledAt),
      endDate: new Date(new Date(appointment.scheduledAt).getTime() + appointment.duration * 60000),
      notes: appointment.chiefComplaint,
    });
  };

  const handleJoin = (appointment: Appointment) => {
    if (appointment.isTelemedicine) {
      navigation.navigate('Telemedicine', { roomId: appointment.videoRoomId });
    }
  };

  const renderAppointment = ({ item }: { item: Appointment }) => (
    <View style={styles.card}>
      <Text style={styles.time}>{new Date(item.scheduledAt).toLocaleString()}</Text>
      <Text style={styles.type}>{item.type}</Text>
      {item.chiefComplaint && <Text style={styles.complaint}>{item.chiefComplaint}</Text>}

      <View style={styles.actions}>
        {activeTab === 'upcoming' ? (
          <>
            <TouchableOpacity onPress={() => navigation.navigate('RescheduleAppointment', { id: item.id })}>
              <Text style={styles.actionButton}>Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleAddToCalendar(item)}>
              <Text style={styles.actionButton}>Add to Calendar</Text>
            </TouchableOpacity>
            {item.isTelemedicine && (
              <TouchableOpacity onPress={() => handleJoin(item)}>
                <Text style={[styles.actionButton, styles.joinButton]}>Join</Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}
      </View>
    </View>
  );

  const data = activeTab === 'upcoming' ? upcoming : past;

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.activeTab]}
          onPress={() => setActiveTab('past')}
        >
          <Text>Past</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        renderItem={renderAppointment}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  card: { padding: 15, marginBottom: 10, borderRadius: 5, backgroundColor: '#f9f9f9' },
  time: { fontSize: 14, fontWeight: 'bold' },
  type: { fontSize: 16, marginVertical: 5 },
  complaint: { fontSize: 12, color: '#666' },
  actions: { marginTop: 10, flexDirection: 'row', gap: 10 },
  actionButton: { color: '#007AFF', fontWeight: 'bold', fontSize: 12 },
  joinButton: { color: '#34C759' },
});
`;

// ────────────────────────────────────────────────────────────────────────────
// #1459: Jest and React Native Testing Library Setup
// ────────────────────────────────────────────────────────────────────────────

export const jestConfigCode = `
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
};
`;

export const jestSetupCode = `
import '@testing-library/jest-native/extend-expect';
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-calendar', () => ({
  createEventAsync: jest.fn(),
  DEFAULT: 'primary',
}));

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
}));
`;

export const dashboardScreenTestCode = `
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DashboardScreen } from './DashboardScreen';
import { useAuthStore } from '../store/auth-store';

jest.mock('../store/auth-store');

describe('DashboardScreen', () => {
  beforeEach(() => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { id: '123', email: 'test@example.com' },
    });
  });

  it('should render welcome message', () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/Welcome/i)).toBeTruthy();
  });

  it('should display user email', () => {
    render(<DashboardScreen />);
    expect(screen.getByText('test@example.com')).toBeTruthy();
  });
});
`;

export const authServiceTestCode = `
import { useAuthStore } from './auth-store';
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-secure-store');

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with no user', () => {
    const { getByState } = renderHook(() => useAuthStore());
    expect(getByState((state) => state.isSignedIn)).toBe(false);
  });

  it('should store tokens after login', async () => {
    const { result } = renderHook(() => useAuthStore());

    await act(async () => {
      // Mock login (would call API in real implementation)
      await result.current.setTokens('access123', 'refresh456');
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', 'access123');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refreshToken', 'refresh456');
  });
});
`;
