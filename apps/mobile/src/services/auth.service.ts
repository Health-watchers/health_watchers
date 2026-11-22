import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import axios, { AxiosInstance } from 'axios';
import { API_URL } from '../config';

// Tests for biometric authentication (mocked expo-local-authentication).
// See auth.service.test.ts for the accompanying test suite.

// Key under which the revocable, device-bound credential is stored.
// The credential is a long-lived device refresh token issued by the backend;
// no password is ever persisted on the device.
const DEVICE_CREDENTIAL_KEY = 'biometric_device_credential';
const BIOMETRIC_EMAIL_KEY = 'biometric_email';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const LEGACY_PASSWORD_PREFIX = 'password_';
const LEGACY_PASSWORD_INDEX_KEY = 'biometric_legacy_password_keys';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
};

export interface BiometricSupport {
  isAvailable: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
}

export interface BiometricLoginResult {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
      timeout: 10000,
    });

    // Add token to requests
    this.api.interceptors.request.use(async (config: any) => {
      const token = await this.getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle token refresh on 401
    this.api.interceptors.response.use(
      (response: any) => response,
      async (error: any) => {
        if (error.response?.status === 401) {
          const refreshed = await this.refreshToken();
          if (refreshed) {
            return this.api.request(error.config);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check whether the device supports biometric authentication and whether
   * the user has enrolled any biometrics. Intended to be called on startup.
   */
  async checkBiometricSupport(): Promise<BiometricSupport> {
    try {
      const isAvailable = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = isAvailable
        ? await LocalAuthentication.isEnrolledAsync()
        : false;
      const supportedTypes = isAvailable
        ? await LocalAuthentication.supportedAuthenticationTypesAsync()
        : [];
      return { isAvailable, isEnrolled, supportedTypes };
    } catch {
      return { isAvailable: false, isEnrolled: false, supportedTypes: [] };
    }
  }

  async login(
    email: string,
    password: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await this.api.post('/auth/login', { email, password });
    const { accessToken, refreshToken } = response.data.data;

    await SecureStore.setItemAsync('accessToken', accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);

    return { accessToken, refreshToken };
  }

  /**
   * Offer biometric enrollment after a successful password login.
   * Enrols a revocable, device-bound credential issued by the backend and
   * stores it in the keychain protected by biometric authentication.
   * The user's password is never written to device storage.
   * Returns true if the device credential was stored for future biometric logins.
   */
  async offerBiometricEnrollment(email: string, password: string): Promise<boolean> {
    const support = await this.checkBiometricSupport();
    if (!support.isAvailable || !support.isEnrolled) {
      return false;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Enable biometric login',
      cancelLabel: 'Not now',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      return false;
    }

    // Exchange the password (used once, never persisted) for a long-lived,
    // revocable device credential bound to this device.
    const response = await this.api.post('/auth/devices', {
      email,
      password,
      deviceName: 'Mobile device',
    });
    const deviceCredential: string | undefined = response.data?.data?.deviceToken;
    if (!deviceCredential) {
      return false;
    }

    await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email);
    await SecureStore.setItemAsync(
      DEVICE_CREDENTIAL_KEY,
      deviceCredential,
      SECURE_STORE_OPTIONS
    );
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
    return true;
  }

  async isBiometricEnabled(): Promise<boolean> {
    return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === 'true';
  }

  async disableBiometric(): Promise<void> {
    // Best-effort server-side revocation so the credential can no longer be used.
    try {
      const deviceCredential = await SecureStore.getItemAsync(
        DEVICE_CREDENTIAL_KEY,
        SECURE_STORE_OPTIONS
      );
      if (deviceCredential) {
        await this.api.delete('/auth/devices/current', {
          headers: { 'X-Device-Token': deviceCredential },
        });
      }
    } catch {
      // Ignore revocation failures; local credential is removed regardless.
    }

    await SecureStore.deleteItemAsync(DEVICE_CREDENTIAL_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  }

  /**
   * Remove any legacy `password_<email>` entries left by older app versions.
   * Safe to call on every startup; a no-op once migrated.
   */
  async migrateLegacyBiometricStorage(): Promise<void> {
    const keys: string[] = [];
    const indexed = await SecureStore.getItemAsync(LEGACY_PASSWORD_INDEX_KEY);
    if (indexed) {
      try {
        const parsed = JSON.parse(indexed);
        if (Array.isArray(parsed)) {
          keys.push(...parsed.filter((k): k is string => typeof k === 'string'));
        }
      } catch {
        // Ignore malformed index.
      }
    }

    const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
    if (email) {
      keys.push(`${LEGACY_PASSWORD_PREFIX}${email}`);
    }

    for (const key of keys) {
      if (key.startsWith(LEGACY_PASSWORD_PREFIX)) {
        await SecureStore.deleteItemAsync(key);
      }
    }
    await SecureStore.deleteItemAsync(LEGACY_PASSWORD_INDEX_KEY);
  }

  /**
   * Prompt for Face ID / fingerprint and log in by exchanging the stored,
   * revocable device credential for fresh access/refresh tokens.
   * Falls back to PIN/password when biometrics fail or are unavailable.
   */
  async loginWithBiometric(
    email?: string,
    fallbackPassword?: string
  ): Promise<BiometricLoginResult> {
    const resolvedEmail = email || (await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY));
    if (!resolvedEmail) {
      throw new Error('No stored credentials for biometric login');
    }

    const support = await this.checkBiometricSupport();
    if (support.isAvailable && support.isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Log in',
        cancelLabel: 'Use password',
        disableDeviceFallback: false,
      });

      if (result.success) {
        const deviceCredential = await SecureStore.getItemAsync(
          DEVICE_CREDENTIAL_KEY,
          SECURE_STORE_OPTIONS
        );
        if (deviceCredential) {
          try {
            const response = await this.api.post('/auth/devices/token', {
              deviceToken: deviceCredential,
            });
            const { accessToken, refreshToken } = response.data.data;
            await SecureStore.setItemAsync('accessToken', accessToken);
            await SecureStore.setItemAsync('refreshToken', refreshToken);
            return { accessToken, refreshToken };
          } catch (error: any) {
            // A revoked or invalidated credential (e.g. password change or
            // device revocation) must not grant access; clear it locally.
            if (error?.response?.status === 401 || error?.response?.status === 403) {
              await SecureStore.deleteItemAsync(DEVICE_CREDENTIAL_KEY);
              await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
            }
            throw new Error('Biometric authentication failed');
          }
        }
      }
    }

    // Fallback to PIN/password
    if (fallbackPassword) {
      return this.login(resolvedEmail, fallbackPassword);
    }

    throw new Error('Biometric authentication failed');
  }

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
  }

  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync('accessToken');
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (!refreshToken) return false;

      const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      const { accessToken } = response.data.data;

      await SecureStore.setItemAsync('accessToken', accessToken);
      return true;
    } catch {
      return false;
    }
  }

  getApiClient(): AxiosInstance {
    return this.api;
  }
}

export const authService = new AuthService();
