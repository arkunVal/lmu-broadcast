import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LMU Broadcast – Livetest",
  description: "Live-Daten aus Le Mans Ultimate",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
