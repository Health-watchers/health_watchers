import type { Response } from 'express';
import type { ApiErrorCode, ApiErrorResponse } from '@health-watchers/types';

export type ApiErrorOverrides = Omit<ApiErrorResponse, 'error' | 'code' | 'message'> &
  Partial<Pick<ApiErrorResponse, 'details' | 'field' | 'stack'>>;

export function sendApiError(
  res: Response,
  statusCode: number,
  error: string,
  code: ApiErrorCode,
  message: string,
  overrides: ApiErrorOverrides = {}
): void {
  const response: ApiErrorResponse = {
    error,
    code,
    message,
    ...overrides,
  };
  res.status(statusCode).json(response);
}
