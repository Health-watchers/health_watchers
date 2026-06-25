import { API_URL } from './api';

// API Configuration
export const API_CONFIG = {
  // Use v2 as the default for new features
  V2_BASE_URL: `${API_URL}/api/v2`,
  // Keep v1 for backward compatibility during migration
  V1_BASE_URL: `${API_URL}/api/v1`,
  
  // Default to v2 for new implementations
  DEFAULT_BASE_URL: `${API_URL}/api/v2`,
  
  // Socket.IO configuration
  SOCKET_URL: API_URL,
  SOCKET_OPTIONS: {
    transports: ['websocket', 'polling'],
    upgrade: true,
    rememberUpgrade: true,
  },
};

// Helper function to get versioned API URL
export function getApiUrl(version: 'v1' | 'v2' = 'v2', endpoint: string = ''): string {
  const baseUrl = version === 'v1' ? API_CONFIG.V1_BASE_URL : API_CONFIG.V2_BASE_URL;
  return endpoint ? `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}` : baseUrl;
}

// API version headers
export const API_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// Enhanced fetch wrapper with version support
export async function fetchWithVersion(
  endpoint: string,
  options: RequestInit = {},
  version: 'v1' | 'v2' = 'v2'
): Promise<Response> {
  const url = getApiUrl(version, endpoint);
  
  const defaultHeaders = {
    ...API_HEADERS,
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers: defaultHeaders,
  });
}