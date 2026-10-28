import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LMU Rennleitung",
  description: "Live-Daten, Overlays und Rennleitung für Le Mans Ultimate",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
