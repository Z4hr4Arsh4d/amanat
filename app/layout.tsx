import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Manrope (SIL Open Font License), served from our own files so pages never wait on an outside font host.
const manrope = localFont({
  src: "./fonts/Manrope-latin.woff2",
  weight: "400 800",
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: { default: "Amanat", template: "%s · Amanat" },
  description: "Every lead is an amanat.",
};

export const viewport: Viewport = { themeColor: "#104e41" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
