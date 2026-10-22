import { NextRequest, NextResponse } from 'next/server';

const STAFF_LOGIN = '/login';
const PORTAL_LOGIN = '/portal/login';
const ONBOARDING_PATH = '/onboarding';

const STAFF_PUBLIC = ['/login', '/forgot-password', '/reset-password', '/mfa'];
const PORTAL_PUBLIC = ['/portal/login'];

const ADMIN_PATHS = ['/settings', '/reports', '/users', '/billing'];
const ADMIN_ROLES = ['CLINIC_ADMIN', 'SUPER_ADMIN'];
/** Admin paths that answer non-admins with a 403 page instead of redirecting home. */
const FORBIDDEN_ON_DENY = ['/settings/staff'];

function isStaffPublic(pathname: string): boolean {
  return STAFF_PUBLIC.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Decode JWT payload without verification (verification happens on the API). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Portal routes (/portal/*) ─────────────────────────────────────────────
  if (pathname.startsWith('/portal')) {
    const isPortalPublic = PORTAL_PUBLIC.some(
      (s) => pathname === s || pathname.startsWith(`${s}/`)
    );
    const portalToken = request.cookies.get('portalAccessToken')?.value;

    if (!portalToken && !isPortalPublic) {
      const loginUrl = new URL(PORTAL_LOGIN, request.url);
      // Store the intended URL so login can redirect back after auth
      loginUrl.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (portalToken && isPortalPublic) {
      // If a returnTo was stored (e.g. deep link), honour it after login
      const returnTo = request.nextUrl.searchParams.get('returnTo');
      const safeReturnTo = returnTo && returnTo.startsWith('/portal/') ? returnTo : '/portal/dashboard';
      return NextResponse.redirect(new URL(safeReturnTo, request.url));
    }
    return NextResponse.next();
  }

  // ── Portal deep links must not expose admin routes ────────────────────────
  // If someone tries to deep-link to an admin path via /portal/, block it
  if (pathname.startsWith('/portal/')) {
    const adminPatterns = ['/portal/patients', '/portal/encounters/new', '/portal/settings/staff', '/portal/users', '/portal/billing', '/portal/reports', '/portal/audit-log'];
    if (adminPatterns.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.redirect(new URL('/portal/dashboard', request.url));
    }
  }

  // ── Staff routes ──────────────────────────────────────────────────────────
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

    // ── Onboarding guard ────────────────────────────────────────────────────
    // If onboarding is not complete, redirect to /onboarding (except when already there)
    if (pathname !== ONBOARDING_PATH && !pathname.startsWith(`${ONBOARDING_PATH}/`)) {
      const onboardingCompleted = payload?.onboardingCompleted as boolean | undefined;
      // Only enforce for clinic staff (not SUPER_ADMIN who manages all clinics)
      const role = payload?.role as string | undefined;
      if (onboardingCompleted === false && role !== 'SUPER_ADMIN') {
        return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url));
      }
    }

    // ── Admin path guard ────────────────────────────────────────────────────
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
