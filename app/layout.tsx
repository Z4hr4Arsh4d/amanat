import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Amanat", description: "Every lead is an amanat." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
