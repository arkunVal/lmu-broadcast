"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { useAuth } from "@/lib/auth";
import type { EventRow } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

/** Für Fahrer: persönlicher Overlay-Link für SimHub. Der Schlüssel im Link gehört nur dem Fahrer, nicht weitergeben. */
export default function DriverOverlayPanel({ event }: { event: EventRow }) {
  const { profile } = useAuth();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    getSupabase()?.rpc("my_overlay_key").then(({ data, error }) => {
      if (error) setError(error.message.includes("my_overlay_key") ? "Datenbank-Update fehlt: supabase/repair.sql ausführen." : error.message);
      else setKey(String(data));
    });
  }, []);
  if (profile?.role !== "driver") return null;
  const url = key ? `${origin}/overlay/me?k=${key}&e=${event.id}` : "";

  return (
    <div className="panel">
      <h3>Dein Fahrer-Overlay (SimHub)</h3>
      <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
        Zeigt dir im Rennen: neue Strafe, Vorfall in Bearbeitung, „Rennleitung spricht“ (auch nur zu dir) und Kurznachrichten.
        SimHub → Dash Studio → Overlay → „Web page view“ → diesen Link einfügen, „Click through“ an, Größe etwa 480 × 300.
        Der Link ist nur für dich. Nicht weitergeben.
      </p>
      {error && <div className="err">{error}</div>}
      {url && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 260 }} />
          <CopyButton text={url} label="Kopieren" />
          <a className="btn" href={`${url}&always=1`} target="_blank" rel="noreferrer">Öffnen</a>
          <a className="btn" href={`${origin}/overlay/me?demo=1`} target="_blank" rel="noreferrer">Vorschau</a>
        </div>
      )}
    </div>
  );
}
