import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Call CRM", description: "SIM-based call management CRM" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
