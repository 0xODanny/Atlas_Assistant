import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Newsreader } from "next/font/google";
import { APP_DISPLAY_NAME, APP_TAGLINE } from "@/lib/config";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  description: APP_TAGLINE,
  applicationName: APP_DISPLAY_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_DISPLAY_NAME,
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F7F7F8",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${newsreader.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
