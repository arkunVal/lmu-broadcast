"use client";

import type { EventRow } from "@/lib/labels";
import { fmtClock } from "@/lib/format";
import { flagInfo, useLive } from "@/lib/liveContext";
import { sessionLabel } from "@/lib/standings";
import ListenerButton from "./ListenerButton";

const STATUS: Record<string, string> = { planned: "Geplant", live: "Live", finished: "Beendet" };

/** Kopfzeile jedes Events: Name links, Live-Status rechts (wie die Statusleiste einer Rennleitungs-Software). */
export default function EventBar({ event, showLive }: { event: EventRow; showLive: boolean }) {
  const { snapshot, connection, age, live, watching, packets } = useLive();
  const s = snapshot?.session;
  const flag = flagInfo(live ? s : undefined);
  const conn = !showLive ? null : connection === "subscribed" ? (live ? { ok: true, t: "Spiel läuft" } : snapshot ? { ok: false, t: "Spiel nicht aktiv" } : { ok: false, t: "Warte auf Reader" }) : connection === "error" ? { ok: false, t: "Verbindungsfehler" } : { ok: false, t: "Verbinde …" };
  const player = snapshot?.cars.find((c) => c.player);
  const watch = watching ?? (player ? { num: player.num, name: player.driver } : null);

  return (
    <div className="evbar">
      <div className="evbar-l">
        <h1>{event.name}</h1>
        <span className="evt-sub">{event.track ?? "Strecke noch offen"}</span>
        <span className={`badge ${event.status === "live" ? "live" : ""}`}>{STATUS[event.status]}</span>
        <ListenerButton />
      </div>
      {showLive && (
        <div className="sbar">
          {conn && (
            <div className="sc">
              <span>Reader</span>
              <b><i className={`dot ${conn.ok ? "ok" : "warn"}`} />{conn.t}</b>
            </div>
          )}
          <div className="sc"><span>Session</span><b>{live && s ? sessionLabel(s.type) : "–"}</b></div>
          <div className="sc"><span>Restzeit</span><b className="num">{live && s ? fmtClock(s.remaining) : "–"}</b></div>
          <div className="sc"><span>Luft</span><b className="num">{live && s ? `${s.airTemp.toFixed(0)}°C` : "–"}</b></div>
          <div className="sc"><span>Strecke</span><b className="num">{live && s ? `${s.trackTemp.toFixed(0)}°C` : "–"}</b></div>
          <div className="sc"><span>Wetter</span><b>{live && s ? (s.rain > 0.05 ? "Regen" : "Trocken") : "–"}</b></div>
          <div className="sc"><span>Kamera</span><b>{live && watch ? `${watch.num != null ? `#${watch.num} ` : ""}${watch.name}` : "–"}</b></div>
          <div className={`sc flag ${flag.cls}`} title={age != null ? `Daten ${age.toFixed(1)} s alt, ${packets} Pakete` : undefined}><b>{flag.text}</b></div>
        </div>
      )}
    </div>
  );
}
