import { authService, AuthService } from '../auth.service';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

jest.mock('expo-secure-store');
jest.mock('axios');

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService();
  });

  describe('login', () => {
    it('stores tokens securely after successful login', async () => {
      const mockResponse = {
        data: {
          data: {
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
          },
        },
      };

      mockAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as any);

      const result = await service.login('user@example.com', 'password123');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'accessToken',
        'mock-access-token'
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'refreshToken',
        'mock-refresh-token'
      );
    });

    it('throws error on failed login', async () => {
      mockAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(new Error('Invalid credentials')),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as any);

      await expect(service.login('user@example.com', 'wrongpass')).rejects.toThrow();
    });
  });

  describe('loginWithBiometric', () => {
    it('retrieves stored password and logs in', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('stored-password');

      const mockResponse = {
        data: {
          data: {
            accessToken: 'biometric-access-token',
            refreshToken: 'biometric-refresh-token',
          },
        },
      };

      mockAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as any);

      const result = await service.loginWithBiometric('user@example.com');

      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('password_user@example.com');
      expect(result.accessToken).toBe('biometric-access-token');
    });

    it('throws error when no stored credentials exist', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      await expect(service.loginWithBiometric('user@example.com')).rejects.toThrow(
        'No stored credentials for biometric login'
      );
    });
  });

  describe('logout', () => {
    it('clears stored tokens', async () => {
      await service.logout();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('accessToken');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('getAccessToken', () => {
    it('retrieves access token from secure storage', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('stored-access-token');

      const token = await service.getAccessToken();

      expect(token).toBe('stored-access-token');
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('accessToken');
    });

    it('returns null when no token is stored', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const token = await service.getAccessToken();

      expect(token).toBeNull();
    });
  });

  describe('getApiClient', () => {
    it('returns axios instance', () => {
      const client = service.getApiClient();

      expect(client).toBeDefined();
    });
  });
});
