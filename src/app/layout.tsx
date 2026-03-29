import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://realqte.com"),
  title: {
    default: "RealQte | Quote & Invoice Software for South African Businesses",
    template: "%s | RealQte",
  },
  description:
    "RealQte is quote and invoice software for small businesses. Create professional quotes, invoices, client records, reports, and payment-ready documents in minutes.",
  keywords: [
    "quote software South Africa",
    "invoice software South Africa",
    "quotation generator South Africa",
    "invoice generator South Africa",
    "online invoicing South Africa",
    "small business invoicing software",
    "quote and invoice app",
    "quotes for contractors",
    "invoices for plumbers",
    "invoices for salons",
    "invoices for freelancers",
    "billing software South Africa",
    "Business tools",
    "How to start a business in South Africa",
    "How start a business",
    "online quotes",
    "Invoicing",
    "entrepreuner tools",
    "entrepreneur",
    "make money at home",
    "make money",
    "build a business",
    "RealQte",
  ],
  applicationName: "RealQte",
  referrer: "origin-when-cross-origin",
  authors: [{ name: "RealQte" }],
  creator: "RealQte",
  publisher: "RealQte",
  category: "business",
  alternates: {
    canonical: "https://realqte.com",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "RealQte | Quote & Invoice Software for South African Businesses",
    description:
      "Create professional quotes and invoices online with RealQte. Built for South African small businesses, contractors, service providers, and growing teams.",
    url: "https://realqte.com",
    siteName: "RealQte",
    locale: "en_ZA",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "RealQte quote and invoice software",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RealQte | Quote & Invoice Software for South African Businesses",
    description:
      "Professional quoting and invoicing software for South African businesses.",
    images: ["/og-image.png"],
  },
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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100`}>
        {children}
      </body>
    </html>
  );
}