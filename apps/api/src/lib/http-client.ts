import { CORRELATION_HEADER } from '@api/middlewares/correlation.middleware';

/**
 * Thin fetch wrapper that forwards the X-Request-ID header to downstream
 * services (e.g. stellar-service) so log entries share the same requestId.
 */
export async function fetchWithCorrelation(
  url: string,
  options: RequestInit & { requestId?: string } = {}
): Promise<Response> {
  const { requestId, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  if (requestId) {
    headers[CORRELATION_HEADER] = requestId;
  }

  return fetch(url, { ...rest, headers });
}
