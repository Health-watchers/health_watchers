import '@testing-library/jest-native/extend-expect';

// Mock Expo modules
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn((key) => Promise.resolve(store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn((key, value) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve();
    }),
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    __resetStore: () => store.clear(),
  };
});

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('mock-notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true, canAskAgain: true }),
  ),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true, canAskAgain: true }),
  ),
  getExpoPushTokenAsync: jest.fn(() =>
    Promise.resolve({ type: 'expo', data: 'ExponentPushToken[mock-token]' }),
  ),
  getDevicePushTokenAsync: jest.fn(() =>
    Promise.resolve({ type: 'ios', data: 'mock-device-token' }),
  ),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([1, 2])),
  authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
  cancelAuthenticate: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    getItem: jest.fn((key) => Promise.resolve(store.has(key) ? store.get(key) : null)),
    setItem: jest.fn((key, value) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve();
    }),
    multiGet: jest.fn((keys) =>
      Promise.resolve(keys.map((key) => [key, store.has(key) ? store.get(key) : null])),
    ),
    multiSet: jest.fn((pairs) => {
      pairs.forEach(([key, value]) => store.set(key, value));
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys) => {
      keys.forEach((key) => store.delete(key));
      return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve(Array.from(store.keys()))),
    clear: jest.fn(() => {
      store.clear();
      return Promise.resolve();
    }),
    __resetStore: () => store.clear(),
  };
});

jest.mock('@react-native-community/netinfo', () => {
  const listeners = new Set();
  let state = { isConnected: true, isInternetReachable: true, type: 'wifi' };
  const netInfo = {
    fetch: jest.fn(() => Promise.resolve(state)),
    addEventListener: jest.fn((listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }),
    useNetInfo: jest.fn(() => state),
    configure: jest.fn(),
    __setState: (next) => {
      state = { ...state, ...next };
      listeners.forEach((listener) => listener(state));
    },
    __reset: () => {
      state = { isConnected: true, isInternetReachable: true, type: 'wifi' };
      listeners.clear();
    },
  };
  return { __esModule: true, default: netInfo, ...netInfo };
});

jest.mock('jail-monkey', () => ({
  isJailBroken: jest.fn(() => false),
  canMockLocation: jest.fn(() => false),
}));

jest.mock('react-native-ssl-public-key-pinning', () => ({
  fetch: jest.fn(),
}));

// Mock React Navigation
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      setOptions: jest.fn(),
    }),
    useRoute: () => ({
      params: {},
    }),
    useFocusEffect: jest.fn(),
  };
});

// Mock React Native modules
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
