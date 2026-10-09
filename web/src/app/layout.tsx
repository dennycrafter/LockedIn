import type { Metadata } from "next";
import { Saira } from "next/font/google";
import "./globals.css";

// Saira is the display font for big numbers only (SPEC 10): timer digits,
// stats, celebration title.
const saira = Saira({
  subsets: ["latin"],
  variable: "--font-saira",
  display: "swap",
});

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
    <html lang="en" className={saira.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
