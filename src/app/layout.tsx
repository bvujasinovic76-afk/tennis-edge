import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EDGE — Tenis MVP",
  description: "Elo model i value-bet kalkulator za ATP tenis, treniran na stvarnim istorijskim rezultatima i kvotama.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
