import { NextRequest, NextResponse } from 'next/server';

const LOGIN_PATH = '/login';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/mfa'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get('accessToken')?.value;
  const isPublic = isPublicPath(pathname);

  if (!accessToken && !isPublic) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (accessToken && isPublic) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
