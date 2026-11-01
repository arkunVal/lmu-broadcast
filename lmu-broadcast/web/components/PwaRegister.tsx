"use client";

import { useEffect } from "react";

/** Registriert den Service Worker, damit Chrome "App installieren" anbietet. */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && !location.pathname.startsWith("/overlay")) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
