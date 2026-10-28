"use client";

import { useEffect, useState } from "react";
import Tires from "@/components/Tires";
import { classColor, classLabel } from "@/lib/classes";
import { fmtClock, fmtGap, fmtTime, phaseName } from "@/lib/format";
import { INCIDENT_KINDS, type EventRow, type Incident } from "@/lib/labels";
import { buildGroups, sessionKind, sessionLabel } from "@/lib/standings";
import { useLiveData } from "@/lib/useLiveData";

export default function LiveTab({
  event, incidents, openIncident,
}: {
  event: EventRow; incidents: Incident[]; openIncident: (id: string) => void;
}) {
  const { snapshot, connection, receivedAt, packets } = useLiveData(event.room);
  const [now, setNow] = useState(() => Date.now());
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const hints = incidents.filter((i) => i.source === "auto" && i.status === "open").slice(0, 10);
  const age = receivedAt ? Math.max(0, (now - receivedAt) / 1000) : null;
  const live = snapshot?.status === "live" && age !== null && age < 5;
  const s = snapshot?.session;
  const kind = s ? sessionKind(s.type) : "race";
  const groups = snapshot && live ? buildGroups(snapshot.cars, kind) : [];
  const anyYellow = !!snapshot && live && snapshot.cars.some((c) => c.yellowCause);

  const connText = connection === "subscribed" ? "Verbunden" : connection === "error" ? "Verbindungsfehler" : connection === "missing-config" ? "Konfiguration fehlt" : "Verbinde …";
  const dataText = !snapshot
    ? "Noch keine Daten vom Reader"
    : snapshot.demo
      ? "Demo-Daten"
      : snapshot.status !== "live"
        ? "Reader läuft, Spiel nicht aktiv"
        : age !== null && age >= 5
          ? "Daten veraltet"
          : "Spiel läuft";

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,1fr)", alignItems: "start", gap: 16 }}>
      <div>
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="chip"><span className={`dot ${connection === "subscribed" ? "ok" : connection === "error" ? "bad" : "warn"}`} />{connText}</span>
          <span className="chip"><span className={`dot ${live ? "ok" : snapshot ? "warn" : ""}`} />{dataText}{age !== null && `, ${age.toFixed(1)} s alt, ${packets} Pakete`}</span>
        </div>
        {anyYellow && <div className="banner">Gelb: Ein Fahrzeug steht auf der Strecke und könnte Gelb auslösen.</div>}

        {!live && (
          <div className="notice">
            {connection === "subscribed"
              ? "Warte auf Live-Daten. Läuft der Reader mit dem Reader-Key dieses Events? Den Key findest du unter „Einstellungen“."
              : "Verbinde …"}
          </div>
        )}

        {s && live && (
          <div className="screen">
            <div className="facts">
              <div className="fact"><span>Strecke</span>{s.track || "–"}</div>
              <div className="fact"><span>Session</span>{sessionLabel(s.type)}</div>
              <div className="fact"><span>Phase</span>{phaseName(s.phase)}</div>
              <div className="fact"><span>Restzeit</span>{fmtClock(s.remaining)}</div>
              <div className="fact"><span>Strecke / Luft</span>{s.trackTemp.toFixed(0)}° / {s.airTemp.toFixed(0)}°C</div>
              <div className="fact"><span>Gelb</span>{s.sectorFlags.some(Boolean) ? s.sectorFlags.map((f, i) => (f ? `S${i + 1}` : null)).filter(Boolean).join(" ") : "–"}</div>
            </div>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.cls} className="screen" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ background: classColor(g.cls), color: "#fff", padding: "5px 14px", fontWeight: 800, letterSpacing: ".08em", fontSize: 12 }}>{classLabel(g.cls)}</div>
            <div className="tablewrap" style={{ border: 0, borderRadius: 0, background: "transparent" }}>
              <table className="plain">
                <thead>
                  <tr>
                    <th className="num">Pos</th><th className="num">Nr</th><th>Fahrer</th><th className="num">km/h</th>
                    <th>Reifen</th><th className="num">Letzte</th><th className="num">Beste</th><th className="num">{kind === "race" ? "Abstand" : "Rückstand"}</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.car.id} className={r.car.yellowCause ? "yellow" : r.car.player ? "player" : ""}>
                      <td className="num">{r.classPos}</td>
                      <td className="num">{r.car.num ?? "–"}</td>
                      <td>{r.car.driver}</td>
                      <td className="num">{Math.round(r.car.speedKmh)}</td>
                      <td><Tires tire={r.car.tire} /></td>
                      <td className="num">{fmtTime(r.car.lastLap)}</td>
                      <td className="num">{fmtTime(r.car.bestLap)}</td>
                      <td className="num">{r.classPos === 1 ? "" : r.gapLeader || fmtGap(r.car.gapLeader)}</td>
                      <td>
                        {r.car.inPits && <span className="tag pit">BOX</span>} {r.car.yellowCause && <span className="tag yel">GELB</span>}
                        {r.car.penalties > 0 && <span className="tag cls"> {r.car.penalties} Str.</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {snapshot && (
          <div style={{ marginTop: 4 }}>
            <button onClick={() => setRaw((v) => !v)}>{raw ? "Rohdaten ausblenden" : "Rohdaten anzeigen"}</button>
            {raw && <pre>{JSON.stringify({ ...snapshot, cars: snapshot.cars.slice(0, 2) }, null, 2)}</pre>}
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Neue Auto-Hinweise</h3>
        <p className="muted" style={{ margin: "2px 0 8px", fontSize: 13 }}>Automatisch erkannt, nicht bestätigt. Bitte prüfen.</p>
        {hints.length === 0 && <div className="muted">Keine offenen Hinweise.</div>}
        {hints.map((h) => (
          <div key={h.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <span>
              <b>{INCIDENT_KINDS[h.kind] ?? h.kind}</b>{" "}
              <span className="muted">{h.session_time != null && fmtClock(h.session_time)}{h.lap != null && `, Runde ${h.lap}`}</span>
              <br />
              <span style={{ fontSize: 13 }}>
                {h.incident_drivers.map((d) => `${d.car_number != null ? `#${d.car_number} ` : ""}${d.ingame_name}${d.role === "possible" ? " (?)" : ""}`).join(", ") || "–"}
              </span>
            </span>
            <button onClick={() => openIncident(h.id)}>Prüfen</button>
          </div>
        ))}
      </div>
    </div>
  );
}
