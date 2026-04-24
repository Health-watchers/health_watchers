import { NextRequest, NextResponse } from 'next/server';

const LOGIN_PATH = '/login';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/mfa'];

const ADMIN_PATHS = ['/settings', '/reports', '/users'];
const ADMIN_ROLES = ['CLINIC_ADMIN', 'SUPER_ADMIN'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
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

  const accessToken = request.cookies.get('accessToken')?.value;
  const isPublic = isPublicPath(pathname);

  if (!accessToken && !isPublic) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (accessToken && isPublic) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (accessToken && isAdminPath(pathname)) {
    const payload = decodeJwtPayload(accessToken);
    const role = payload?.role as string | undefined;
    if (!role || !ADMIN_ROLES.includes(role)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
