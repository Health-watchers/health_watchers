import * as SecureStore from 'expo-secure-store';
import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

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

  async loginWithBiometric(email: string): Promise<{ accessToken: string; refreshToken: string }> {
    const storedPassword = await SecureStore.getItemAsync(`password_${email}`);
    if (!storedPassword) {
      throw new Error('No stored credentials for biometric login');
    }
    return this.login(email, storedPassword);
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
