"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

/** Keine eigene Startseite: wer die Adresse öffnet, landet direkt im Anmelde-Fenster (oder, wenn schon angemeldet, im Event-Bereich). */
export default function Start() {
  const { session, profile, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
    else if (profile) router.replace(profile.role ? "/events" : "/willkommen");
  }, [loading, session, profile, router]);
  return <p className="muted">Lade …</p>;
}
