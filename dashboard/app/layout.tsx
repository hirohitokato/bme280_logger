import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BME280 Dashboard",
  description: "Supabase-backed environmental dashboard for BME280 measurements.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
