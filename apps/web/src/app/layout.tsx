import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import { ErrorBoundary } from "../components/ui/error-boundary";
import { QueryProvider } from "@/lib/QueryProvider";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import AppLayout from "@/components/layout/AppLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Health Watchers",
    template: "%s | Health Watchers",
  },
  description: "AI-assisted Electronic Medical Record (EMR) powered by Stellar blockchain. Secure, decentralized healthcare records management.",
  keywords: ["EMR", "healthcare", "medical records", "Stellar blockchain", "AI healthcare", "patient management"],
  authors: [{ name: "Health Watchers Team" }],
  creator: "Health Watchers",
  publisher: "Health Watchers",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Health Watchers",
    description: "AI-assisted Electronic Medical Record (EMR) powered by Stellar blockchain",
    url: "https://healthwatchers.com",
    siteName: "Health Watchers",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Health Watchers - AI-assisted EMR",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Health Watchers",
    description: "AI-assisted Electronic Medical Record (EMR) powered by Stellar blockchain",
    images: ["/og-image.png"],
    creator: "@healthwatchers",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
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
            <RealtimeProvider>
              <AppLayout>
                <div id="main-content" tabIndex={-1}>
                  <ErrorBoundary>
                    {children}
                  </ErrorBoundary>
                </div>
              </AppLayout>
            </RealtimeProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
