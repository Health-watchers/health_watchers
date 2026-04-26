import { NextRequest, NextResponse } from 'next/server';

const STAFF_LOGIN = '/login';
const PORTAL_LOGIN = '/portal/login';
const ONBOARDING_PATH = '/onboarding';

const STAFF_PUBLIC = ['/login', '/forgot-password', '/reset-password', '/mfa'];
const PORTAL_PUBLIC = ['/portal/login'];

const ADMIN_PATHS = ['/settings', '/reports', '/users'];
const ADMIN_ROLES = ['CLINIC_ADMIN', 'SUPER_ADMIN'];

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
      return NextResponse.redirect(new URL(PORTAL_LOGIN, request.url));
    }
    if (portalToken && isPortalPublic) {
      return NextResponse.redirect(new URL('/portal/dashboard', request.url));
    }
    return NextResponse.next();
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
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
