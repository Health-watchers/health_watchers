import type { NextRequest } from 'next/server';

/**
 * Headers that let the API see the browser and client IP behind this proxy route.
 * Without them every sign-in reaches the API as the Next.js server, which defeats
 * new-device / new-location sign-in alerts (#1497).
 */
export function clientContextHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  const userAgent = request.headers.get('user-agent');
  if (userAgent) headers['User-Agent'] = userAgent;
  const forwardedFor = request.headers.get('x-forwarded-for') ?? request.ip;
  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor;
  return headers;
}
