import { randomUUID } from 'crypto';
import { CORRELATION_HEADER } from '@api/middlewares/correlation.middleware';
import { getRequestId } from '@api/utils/request-id';

/**
 * Thin fetch wrapper that forwards the X-Request-ID header to downstream
 * services (e.g. stellar-service) so log entries share the same requestId.
 *
 * It also forwards the W3C `traceparent` header (when available) so that
 * OpenTelemetry trace IDs correlate with request IDs across services.
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

  // Always attach a request ID: prefer explicit, then context, then a fresh UUID.
  const requestId = explicitRequestId || getRequestId() || randomUUID();
  headers[CORRELATION_HEADER] = requestId;

  // Forward the W3C traceparent header so OTel trace IDs correlate with
  // request IDs across services. Only set it if not already provided.
  const traceparent = getTraceparent();
  if (traceparent && !headers['traceparent']) {
    headers['traceparent'] = traceparent;
  }

  return fetch(url, { ...rest, headers });
}

/**
 * Builds a W3C `traceparent` header value from the active OpenTelemetry span,
 * if one is available. Returns undefined when no active span exists.
 */
function getTraceparent(): string | undefined {
  try {
    // Lazily require to avoid a hard dependency when OTel is not configured.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { trace, isSpanContextValid } = require('@opentelemetry/api');
    const span = trace.getActiveSpan();
    if (!span) {
      return undefined;
    }
    const spanContext = span.spanContext();
    if (!spanContext || !isSpanContextValid(spanContext)) {
      return undefined;
    }
    const { traceId, spanId, traceFlags } = spanContext;
    const flags = (traceFlags ?? 0).toString(16).padStart(2, '0');
    return `00-${traceId}-${spanId}-${flags}`;
  } catch {
    return undefined;
  }
}