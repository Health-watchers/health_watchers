import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import Navbar from "../components/Navbar";
import { ErrorBoundary } from "../components/ui/error-boundary";
import { QueryProvider } from "@/lib/QueryProvider";
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
      <body className="min-h-screen bg-neutral-50 font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            <Navbar />
            <div id="main-content" tabIndex={-1}>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
