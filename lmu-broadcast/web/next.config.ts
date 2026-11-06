import type { NextConfig } from "next";

// Statischer Export: Die Desktop-App (Electron) liefert den Ordner "out" lokal aus (http://127.0.0.1:47821).
// Server-Teile liegen in supabase/functions/api. Sicherheits-Header (CSP) setzt die Desktop-App, siehe desktop/main.js.
const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
