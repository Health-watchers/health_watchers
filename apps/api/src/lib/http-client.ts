import { CORRELATION_HEADER } from '@api/middlewares/correlation.middleware';
import { getRequestId } from '@api/utils/request-id';

/**
 * Thin fetch wrapper that forwards the X-Request-ID header to downstream
 * services (e.g. stellar-service) so log entries share the same requestId.
 */
export async function fetchWithCorrelation(
  url: string,
  options: RequestInit & { requestId?: string } = {}
): Promise<Response> {
  const { requestId: explicitRequestId, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  const requestId = explicitRequestId || getRequestId();
  if (requestId) {
    headers[CORRELATION_HEADER] = requestId;
  }

  return fetch(url, { ...rest, headers });
}
