/**
 * Unified Next.js middleware — the ONLY middleware file for the web app.
 *
 * Next.js resolves middleware in this priority order when a src/ directory
 * exists: src/middleware.ts → middleware.ts (root is never reached).
 * The root apps/web/middleware.ts has therefore been deleted; all logic now
 * lives here.  See: https://nextjs.org/docs/app/building-your-application/routing/middleware
 *
 * Responsibilities (in execution order):
 *  1. Always-public paths (/not-me) — pass through immediately.
 *  2. Portal routes (/portal/*) — portalAccessToken cookie guard + returnTo.
 *  3. Staff routes — accessToken cookie guard + returnTo.
 *  4. Onboarding guard — redirect incomplete clinic staff to /onboarding.
 *  5. Admin-path RBAC — non-admins get 403 on /settings/staff, redirect home
 *     for all other admin paths.
 *  6. Locale cookie — set once so the locale persists across page refreshes
 *     (resolved from: locale cookie → Accept-Language header → defaultLocale).
 */

import { NextRequest, NextResponse } from 'next/server';
import { locales, enabledLocales, defaultLocale } from '../i18n.config';

// ── Route constants ───────────────────────────────────────────────────────────

const STAFF_LOGIN = '/login';
const PORTAL_LOGIN = '/portal/login';
const ONBOARDING_PATH = '/onboarding';

const STAFF_PUBLIC = ['/login', '/forgot-password', '/reset-password', '/mfa'];
const PORTAL_PUBLIC = ['/portal/login'];

/**
 * Reachable whether or not the visitor is signed in
 * (e.g. "This wasn't me" alert links from notification emails).
 */
const ALWAYS_PUBLIC = ['/not-me'];

const ADMIN_PATHS = ['/settings', '/reports', '/users', '/billing'];
const ADMIN_ROLES = ['CLINIC_ADMIN', 'SUPER_ADMIN'];

/**
 * Admin paths that answer non-admins with a 403 page instead of silently
 * redirecting home — these paths are sensitive enough that a redirect would
 * hide the fact that access was denied.
 */
const FORBIDDEN_ON_DENY = ['/settings/staff'];

/**
 * Portal paths that must never be reachable even if someone constructs a
 * direct deep-link with a valid portalAccessToken.
 */
const PORTAL_BLOCKED_PATHS = [
  '/portal/patients',
  '/portal/encounters/new',
  '/portal/settings/staff',
  '/portal/users',
  '/portal/billing',
  '/portal/reports',
  '/portal/audit-log',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isStaffPublic(pathname: string): boolean {
  return STAFF_PUBLIC.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Decode JWT payload without signature verification.
 * Verification happens on the API; here we only need claims for routing
 * decisions (role, onboardingCompleted).
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/**
 * Resolve the preferred locale from (in priority order):
 *  1. The `locale` cookie already set on the client.
 *  2. The primary language tag in the `Accept-Language` header.
 *  3. The application default locale.
 */
function resolveLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get('locale')?.value;
  if (cookieLocale && enabledLocales.includes(cookieLocale as (typeof locales)[number])) {
    return cookieLocale;
  }
  const headerLocale = request.headers.get('accept-language')?.split(',')[0].split('-')[0];
  return locales.find((l) => l === headerLocale) ?? defaultLocale;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Always-public paths ────────────────────────────────────────────────
  if (ALWAYS_PUBLIC.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  // ── 2. Portal routes (/portal/*) ─────────────────────────────────────────
  if (pathname.startsWith('/portal')) {
    // Block staff-only paths even with a valid portal token.
    if (PORTAL_BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.redirect(new URL('/portal/dashboard', request.url));
    }

    const isPortalPublic = PORTAL_PUBLIC.some(
      (s) => pathname === s || pathname.startsWith(`${s}/`)
    );
    const portalToken = request.cookies.get('portalAccessToken')?.value;

    if (!portalToken && !isPortalPublic) {
      const loginUrl = new URL(PORTAL_LOGIN, request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (portalToken && isPortalPublic) {
      const returnTo = request.nextUrl.searchParams.get('returnTo');
      const safeReturnTo =
        returnTo && returnTo.startsWith('/portal/') ? returnTo : '/portal/dashboard';
      return NextResponse.redirect(new URL(safeReturnTo, request.url));
    }

    // Portal authenticated — still apply locale cookie below.
  } else {
    // ── 3. Staff routes ───────────────────────────────────────────────────
    const accessToken = request.cookies.get('accessToken')?.value;
    const isPublic = isStaffPublic(pathname);

    if (!accessToken && !isPublic) {
      const loginUrl = new URL(STAFF_LOGIN, request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (accessToken && isPublic) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    if (accessToken) {
      const payload = decodeJwtPayload(accessToken);

      // ── 4. Onboarding guard ─────────────────────────────────────────────
      // Redirect clinic staff who have not completed onboarding.
      // SUPER_ADMIN manages all clinics and is exempt.
      if (pathname !== ONBOARDING_PATH && !pathname.startsWith(`${ONBOARDING_PATH}/`)) {
        const onboardingCompleted = payload?.onboardingCompleted as boolean | undefined;
        const role = payload?.role as string | undefined;
        if (onboardingCompleted === false && role !== 'SUPER_ADMIN') {
          return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url));
        }
      }

      // ── 5. Admin-path RBAC ──────────────────────────────────────────────
      if (isAdminPath(pathname)) {
        const role = payload?.role as string | undefined;
        if (!role || !ADMIN_ROLES.includes(role)) {
          if (FORBIDDEN_ON_DENY.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
            return NextResponse.rewrite(new URL('/forbidden', request.url), { status: 403 });
          }
          return NextResponse.redirect(new URL('/', request.url));
        }
      }
    }
  }

  // ── 6. Locale cookie ──────────────────────────────────────────────────────
  // Set once so the locale survives page refreshes without a round-trip.
  const cookieLocale = request.cookies.get('locale')?.value;
  const response = NextResponse.next();
  if (!cookieLocale) {
    const locale = resolveLocale(request);
    response.cookies.set('locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
