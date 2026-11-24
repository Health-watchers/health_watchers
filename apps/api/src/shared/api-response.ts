export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  requestId?: string;
}

export function ok<T>(data: T, requestId?: string): ApiResponse<T> {
  return { ok: true, data, requestId };
}

export function fail(code: string, message: string, requestId?: string): ApiResponse<never> {
  return { ok: false, error: { code, message }, requestId };
}
