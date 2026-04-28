import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale, type Locale } from '../../../../i18n.config';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locale: Locale = locales.includes(body.locale) ? (body.locale as Locale) : defaultLocale;

  const response = NextResponse.json({ locale });
  response.cookies.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false, // readable by JS for LanguageSwitcher
  });
  return response;
}
