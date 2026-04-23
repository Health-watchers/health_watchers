import { NextRequest, NextResponse } from 'next/server';

const STAFF_LOGIN = '/login';
const PORTAL_LOGIN = '/portal/login';

const STAFF_PUBLIC = ['/login', '/forgot-password', '/reset-password', '/mfa'];
const PORTAL_PUBLIC = ['/portal/login'];

function isStaffPublic(p: string) {
  return STAFF_PUBLIC.some((s) => p === s || p.startsWith(`${s}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // ── Portal routes (/portal/*) ─────────────────────────────────────────────
  if (pathname.startsWith('/portal')) {
    const isPortalPublic = PORTAL_PUBLIC.some((s) => pathname === s || pathname.startsWith(`${s}/`));
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
    return NextResponse.redirect(new URL(STAFF_LOGIN, request.url));
  }
  if (accessToken && isPublic) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
