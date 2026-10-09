import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LockedIn",
  description: "One place to get focused work done.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
