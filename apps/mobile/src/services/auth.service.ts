import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import axios, { AxiosInstance } from 'axios';

// Tests for biometric authentication (mocked expo-local-authentication).
// See auth.service.test.ts for the accompanying test suite.

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

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
   * Returns true if credentials were stored for future biometric logins.
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

    await SecureStore.setItemAsync(`biometric_email`, email);
    await SecureStore.setItemAsync(`password_${email}`, password, {
      requireAuthentication: true,
    });
    await SecureStore.setItemAsync('biometric_enabled', 'true');
    return true;
  }

  async isBiometricEnabled(): Promise<boolean> {
    return (await SecureStore.getItemAsync('biometric_enabled')) === 'true';
  }

  async disableBiometric(): Promise<void> {
    const email = await SecureStore.getItemAsync('biometric_email');
    if (email) {
      await SecureStore.deleteItemAsync(`password_${email}`);
    }
    await SecureStore.deleteItemAsync('biometric_email');
    await SecureStore.deleteItemAsync('biometric_enabled');
  }

  /**
   * Prompt for Face ID / fingerprint and log in using stored credentials.
   * Falls back to PIN/password when biometrics fail or are unavailable.
   */
  async loginWithBiometric(
    email?: string,
    fallbackPassword?: string
  ): Promise<BiometricLoginResult> {
    const resolvedEmail = email || (await SecureStore.getItemAsync('biometric_email'));
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
        const storedPassword = await SecureStore.getItemAsync(`password_${resolvedEmail}`);
        if (storedPassword) {
          return this.login(resolvedEmail, storedPassword);
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
