import { isSyntheticPreview, PREVIEW_UNAVAILABLE_MESSAGE } from '@/lib/preview-mode'
import type { Metadata } from "next";
import { Geist, Geist_Mono, Anton } from "next/font/google";
import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/gtag";
import { serializeJsonForHtml } from "@/lib/json-for-html";
import { LocalStackProvider } from "@/components/LocalStackContext";
import StackFAB from "@/components/StackFAB";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const SITE_URL = "https://www.theliftinglab.co.uk";
const SITE_TITLE = "The Lifting Lab — Evidence-Based Supplement Scoring (UK)";
const SITE_DESCRIPTION =
  "UK supplements ranked against evidence-based reference doses. Browse 200+ products by category, compare head-to-head, and build a safe, effective stack.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...(isSyntheticPreview() ? { robots: { index: false, follow: false } } : {}),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "The Lifting Lab",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: SITE_URL,
    siteName: "The Lifting Lab",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {isSyntheticPreview() && (
          <aside role="status" data-testid="synthetic-preview-notice" className="border-b border-lab-lime bg-lab-lime px-4 py-3 text-center text-sm font-semibold text-black">
            {PREVIEW_UNAVAILABLE_MESSAGE} Product lists may be empty.
          </aside>
        )}
        <LocalStackProvider>
          {children}
          <StackFAB />
        </LocalStackProvider>
      </body>
      {!isSyntheticPreview() && <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', ${serializeJsonForHtml(GA_MEASUREMENT_ID)});
        `}
      </Script>
      </>}
    </html>
  );
}
