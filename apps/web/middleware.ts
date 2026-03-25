import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale } from "./i18n";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Read locale from cookie, fall back to Accept-Language header, then default
  const cookieLocale = request.cookies.get("locale")?.value;
  const headerLocale = request.headers
    .get("accept-language")
    ?.split(",")[0]
    .split("-")[0];

  const locale =
    locales.find((l) => l === cookieLocale) ||
    locales.find((l) => l === headerLocale) ||
    defaultLocale;

  const response = NextResponse.next();
  // Ensure cookie is set so it persists across refreshes
  if (!cookieLocale) {
    response.cookies.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
