import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://realqte.com"),
  title: {
    default: "RealQte | Quotes, Invoices, Mini Websites & CRM for Small Businesses",
    template: "%s | RealQte",
  },
  description:
    "RealQte helps small businesses worldwide create professional quotes and invoices, launch mini websites, capture quote requests, and manage leads with CRM tools in one platform.",
  keywords: [
    "quote software",
    "invoice software",
    "quotation generator",
    "invoice generator",
    "online invoicing",
    "small business invoicing software",
    "quote and invoice app",
    "quotes for contractors",
    "invoices for plumbers",
    "invoices for salons",
    "invoices for freelancers",
    "billing software",
    "business tools",
    "online quotes",
    "invoicing",
    "entrepreneur tools",
    "small business CRM",
    "CRM for small businesses",
    "mini website builder",
    "business website builder",
    "quote request form website",
    "lead capture for small business",
    "freelancer invoicing software",
    "contractor quoting software",
    "service business software",
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
    title: "RealQte | Quotes, Invoices, Mini Websites & CRM for Small Businesses",
    description:
      "Create professional quotes and invoices, launch a mini website, capture quote requests, and manage leads with RealQte.",
    url: "https://realqte.com",
    siteName: "RealQte",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "RealQte business growth platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RealQte | Quotes, Invoices, Mini Websites & CRM for Small Businesses",
    description:
      "Professional quoting, invoicing, mini website, and CRM tools for small businesses worldwide.",
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
    <html lang="en">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100`}>
        {children}
      </body>
    </html>
  );
}
