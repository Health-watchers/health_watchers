import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  ApiSuccess,
  Appointment,
  CreateAppointmentInput,
  CreatePatientInput,
  CreatePaymentIntentInput,
  ListAppointmentsParams,
  ListPatientsParams,
  LoginResponse,
  PaginatedResponse,
  Patient,
  PaymentIntent,
} from './types';

/**
 * Shape of a successful API response body. The API is not fully consistent:
 * some handlers return `{ status: 'success', data }` while others return
 * `{ success: true, data }`. Both are accepted here.
 */
export type ApiEnvelope<T> =
  | { status: 'success'; data: T }
  | { success: true; data: T }
  | T;

/**
 * Unwrap an API response body, accepting both envelope variants.
 *
 * The HTTP status is the source of truth for success: axios only resolves for
 * 2xx responses, so by the time this runs the request has already succeeded.
 * If the body carries a recognised envelope the payload is returned, otherwise
 * the body itself is returned unchanged.
 */
export function unwrapResponse<T>(body: unknown): T {
  if (body !== null && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const isSuccessEnvelope =
      record.status === 'success' || record.success === true;
    if (isSuccessEnvelope && 'data' in record) {
      return record.data as T;
    }
  }
  return body as T;
}

export interface HealthWatchersClientOptions {
  /**
   * Base URL of the Health Watchers API, including the version prefix,
   * e.g. "https://api.healthwatchers.com/api/v1" or
   * "http://localhost:3001/api/v1" for local development.
   */
  baseUrl: string;
  /**
   * API key for service-to-service auth. Sent as the `X-API-Key` header.
   * Create one via `POST /api-keys` (requires an authenticated bearer session).
   * Mutually exclusive with `accessToken` — if both are set, `accessToken`
   * (bearer) takes precedence.
   */
  apiKey?: string;
  /**
   * A previously-issued JWT access token. Sent as `Authorization: Bearer <token>`.
   * You can also obtain/refresh this by calling `client.login(email, password)`.
   */
  accessToken?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}

export class HealthWatchersClient {
  private readonly http: AxiosInstance;
  private accessToken?: string;
  private apiKey?: string;

  readonly patients: PatientsResource;
  readonly appointments: AppointmentsResource;
  readonly payments: PaymentsResource;

  constructor(options: HealthWatchersClientOptions) {
    this.accessToken = options.accessToken;
    this.apiKey = options.apiKey;

    this.http = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs ?? 30_000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Attach the current auth header on every request so callers can log in
    // (or rotate credentials) after the client has already been constructed.
    this.http.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      } else if (this.apiKey) {
        config.headers['X-API-Key'] = this.apiKey;
      }
      return config;
    });

    this.patients = new PatientsResource(this.http);
    this.appointments = new AppointmentsResource(this.http);
    this.payments = new PaymentsResource(this.http);
  }

  /** Returns the JWT access token currently in use, if any. */
  getAccessToken(): string | undefined {
    return this.accessToken;
  }

  /** Manually set (or clear) the JWT access token used for subsequent requests. */
  setAccessToken(accessToken: string | undefined): void {
    this.accessToken = accessToken;
  }

  /** Manually set (or clear) the API key used for subsequent requests. */
  setApiKey(apiKey: string | undefined): void {
    this.apiKey = apiKey;
  }

  /**
   * Authenticate with email/password via POST /auth/login.
   *
   * On success the returned access/refresh tokens are stored on the client
   * so subsequent calls are authenticated automatically. If the account has
   * MFA enabled, the API instead returns `{ status: 'mfa_required', ... }`
   * with a `tempToken` — the client does NOT store anything in that case,
   * and it's up to the caller to complete the MFA challenge separately.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await this.http.post<LoginResponse>('/auth/login', { email, password });
    const body = res.data;
    // HTTP status is the source of truth; accept both envelope variants.
    if (body && (body.status === 'success' || (body as { success?: boolean }).success === true)) {
      const data = this.unwrap<LoginResponse['data']>(res);
      if (data && data.accessToken) {
        this.accessToken = data.accessToken;
      }
    }
    return body;
  }

  /**
   * Unwrap a successful response body, accepting both `{ status: 'success', data }`
   * and `{ success: true, data }` envelopes. HTTP status is the source of truth:
   * axios only resolves for 2xx responses, so reaching this point means success.
   * If the body has no recognised envelope, the body itself is returned.
   */
  private unwrap<T>(response: AxiosResponse<unknown>): T {
    return unwrapResponse<T>(response.data);
  }
}

class PatientsResource {
  constructor(private readonly http: AxiosInstance) {}

  async create(data: CreatePatientInput): Promise<Patient> {
    const res = await this.http.post<ApiSuccess<Patient>>('/patients', data);
    return unwrapResponse<Patient>(res.data);
  }

  async list(params?: ListPatientsParams): Promise<PaginatedResponse<Patient>> {
    const res = await this.http.get<PaginatedResponse<Patient>>('/patients', { params });
    return unwrapResponse<PaginatedResponse<Patient>>(res.data);
  }

  async get(id: string): Promise<Patient> {
    const res = await this.http.get<ApiSuccess<Patient>>(`/patients/${encodeURIComponent(id)}`);
    return unwrapResponse<Patient>(res.data);
  }
}

class AppointmentsResource {
  constructor(private readonly http: AxiosInstance) {}

  async create(data: CreateAppointmentInput): Promise<Appointment> {
    const res = await this.http.post<ApiSuccess<Appointment>>('/appointments', data);
    return unwrapResponse<Appointment>(res.data);
  }

  async list(params?: ListAppointmentsParams): Promise<PaginatedResponse<Appointment>> {
    const res = await this.http.get<PaginatedResponse<Appointment>>('/appointments', { params });
    return unwrapResponse<PaginatedResponse<Appointment>>(res.data);
  }

  async get(id: string): Promise<Appointment> {
    const res = await this.http.get<ApiSuccess<Appointment>>(
      `/appointments/${encodeURIComponent(id)}`
    );
    return unwrapResponse<Appointment>(res.data);
  }
}

class PaymentsResource {
  constructor(private readonly http: AxiosInstance) {}

  /** POST /payments/intent — create a pending payment intent for a Stellar transaction. */
  async createIntent(data: CreatePaymentIntentInput): Promise<PaymentIntent> {
    const res = await this.http.post<ApiSuccess<PaymentIntent>>('/payments/intent', data);
    return unwrapResponse<PaymentIntent>(res.data);
  }

  /** PATCH /payments/:intentId/confirm — confirm a payment intent with its Stellar tx hash. */
  async confirmIntent(intentId: string, txHash: string): Promise<PaymentIntent> {
    const res = await this.http.patch<ApiSuccess<PaymentIntent>>(
      `/payments/${encodeURIComponent(intentId)}/confirm`,
      { txHash }
    );
    return unwrapResponse<PaymentIntent>(res.data);
  }
}

// Re-exported so callers can type ad-hoc request overrides without pulling in axios directly.
export type { AxiosRequestConfig };
