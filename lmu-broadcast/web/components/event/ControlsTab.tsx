"use client";

import { useAuth } from "@/lib/auth";
import { useCamera } from "@/lib/useCamera";
import type { EventRow } from "@/lib/labels";
import OverlaysTab from "./OverlaysTab";
import VoicePanel from "./VoicePanel";

/** Steuerung der Übertragung: Kamera im Spiel, Sprechfunk, OBS-Overlays. */
export default function ControlsTab({ event }: { event: EventRow }) {
  const { profile } = useAuth();
  const staff = profile?.role === "admin" || profile?.role === "steward";
  const { msg, busy, control } = useCamera(event.id);

  return (
    <div className="scrollarea controls">
      <div className="split a" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="panel">
            <h3>Kamera im Spiel</h3>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>Wirkt am Rennrechner. Ein Auto direkt wählst du in „Live Timings“ per Klick auf die Zeile.</p>
            <div className="camrow">
              <button onClick={() => control("prev")} disabled={busy} title="Vorheriges Auto im Spiel anwählen">◀ Voriges Auto</button>
              <button onClick={() => control("next")} disabled={busy} title="Nächstes Auto im Spiel anwählen">Nächstes Auto ▶</button>
              <button onClick={() => control("live")} disabled={busy} title="Das Spiel verlässt das Replay und zeigt wieder das Live-Bild.">↩ Zurück zu Live</button>
              {busy && <span className="muted" style={{ fontSize: 13 }}>Sende …</span>}
              {msg && <span className={msg.ok ? "okmsg" : "err"} style={{ margin: 0 }}>{msg.ok ? "✓ " : ""}{msg.text}</span>}
            </div>
          </div>
          {staff && <VoicePanel />}
        </div>
        <div className="stack">
          <h3 style={{ margin: "0 0 2px" }}>OBS-Overlays</h3>
          <OverlaysTab event={event} />
        </div>
      </div>
    </div>
  );
}
