import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import Navbar from "../components/Navbar";
import { ErrorBoundary } from "../components/ui/error-boundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "Health Watchers",
  description: "AI-assisted EMR powered by Stellar blockchain",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-white text-gray-900 font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Navbar />
          <div id="main-content" tabIndex={-1}>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
