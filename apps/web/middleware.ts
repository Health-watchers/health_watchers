import { NextRequest, NextResponse } from 'next/server';
import { locales, enabledLocales, defaultLocale } from './i18n.config';

const protectedRoutes = ['/patients', '/encounters', '/payments', '/settings', '/wallet'];
const publicRoutes = ['/login'];

const CDN_ORIGIN = process.env.NEXT_PUBLIC_CDN_ORIGIN || 'https://cdn.healthy-stellar.app';
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${CDN_ORIGIN}`,
    `style-src 'self' 'nonce-${nonce}' ${CDN_ORIGIN}`,
    `img-src 'self' data: https: ${CDN_ORIGIN}`,
    `font-src 'self' data: ${CDN_ORIGIN}`,
    `connect-src 'self' ${API_ORIGIN} https://horizon-testnet.stellar.org https://horizon.stellar.org`,
    `frame-ancestors 'none'`,
    `report-uri ${API_ORIGIN}/api/v1/csp-report`,
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and API routes
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // Forward the nonce to server components via request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
=======

  const accessToken = request.cookies.get('accessToken')?.value;
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  // Redirect to login if accessing protected route without token
  if (isProtectedRoute && !accessToken) {
    const redirect = NextResponse.redirect(new URL('/login', request.url));
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }

  // Redirect to home if accessing login with token
  if (isPublicRoute && accessToken) {
    const redirect = NextResponse.redirect(new URL('/', request.url));
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }

  // Read locale from cookie, fall back to Accept-Language header, then default
  const cookieLocale = request.cookies.get('locale')?.value;
  const headerLocale = request.headers.get('accept-language')?.split(',')[0].split('-')[0];

  const locale =
    enabledLocales.find((l) => l === cookieLocale) ||
    locales.find((l) => l === headerLocale) ||
    defaultLocale;

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);
  // Ensure cookie is set so it persists across refreshes
  if (!cookieLocale) {
    response.cookies.set('locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
