"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import HintButtons from "./HintButtons";
import { pickFocus } from "@/lib/focus";
import ReplayLink from "./ReplayLink";
import Tires from "@/components/Tires";
import TrackMap from "@/components/TrackMap";
import { classColor, classLabel } from "@/lib/classes";
import { fmtClock, fmtGap, fmtTime } from "@/lib/format";
import { INCIDENT_KINDS, type EventRow, type Incident } from "@/lib/labels";
import { buildGroups, sessionKind, sessionLabel } from "@/lib/standings";
import type { Car } from "@/lib/types";
import { useLiveData } from "@/lib/useLiveData";

export default function LiveTab({
  event, incidents, openIncident, reload,
}: {
  event: EventRow; incidents: Incident[]; openIncident: (id: string) => void; reload: () => void;
}) {
  const { profile } = useAuth();
  const isStaff = profile?.role === "admin" || profile?.role === "steward";
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

  const flag = !s
    ? { cls: "", text: "" }
    : s.phase === 7
      ? { cls: "red", text: "SESSION GESTOPPT" }
      : s.phase === 6
        ? { cls: "yellow", text: "FULL COURSE YELLOW" }
        : s.sectorFlags.some(Boolean)
          ? { cls: "yellow", text: "GELB" }
          : { cls: "", text: "GRÜNE FLAGGE" };

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
    <div className="live-grid">
      <div className="live-left">
        <TrackMap snapshot={live ? snapshot : null} panel />
      <div className="panel">
        <h3>Auto-Hinweise</h3>
        <p className="muted" style={{ margin: "2px 0 8px", fontSize: 13 }}>Noch keine Vorfälle. {isStaff ? "„Ist Vorfall“ übernimmt den Hinweis in Bearbeitung, „Kein Vorfall“ löscht ihn." : "Die Rennleitung prüft sie."}</p>
        {hints.length === 0 && <div className="muted">Keine offenen Hinweise.</div>}
        {hints.map((h) => (
          <div key={h.id} className="hint-item">
            <div>
              <b>{INCIDENT_KINDS[h.kind] ?? h.kind}</b>{" "}
              <span className="muted">{h.session_time != null && fmtClock(h.session_time)}{h.lap != null && `, R${h.lap}`}</span>
              <div style={{ fontSize: 13 }}>
                {h.incident_drivers.map((d) => `${d.car_number != null ? `#${d.car_number} ` : ""}${d.ingame_name}${d.role === "possible" ? " (?)" : ""}`).join(", ") || "–"}
              </div>
            </div>
            <div style={{ marginTop: 6 }}><ReplayLink event={event} sessionTime={h.session_time} focus={pickFocus(h)} small /></div>
            {isStaff && <div style={{ marginTop: 6 }}><HintButtons id={h.id} reload={reload} /></div>}
          </div>
        ))}
      </div>
      </div>
      <div className="live-right">
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
          <div className="live-bar">
            <div>
              <div className="k">Strecke</div>
              <div style={{ fontWeight: 700 }}>{s.track || "–"}</div>
            </div>
            <div>
              <div className="k">{sessionLabel(s.type)}</div>
              <span className={`flagpill ${flag.cls}`}><i />{flag.text}</span>
            </div>
            <div><div className="k">Restzeit</div><div className="v">{fmtClock(s.remaining)}</div></div>
            <div><div className="k">Luft / Strecke</div><div className="v">{s.airTemp.toFixed(0)}° / {s.trackTemp.toFixed(0)}°C</div></div>
            <div><div className="k">Wetter</div><div className="v">{s.rain > 0.05 ? "Regen" : "Trocken"}</div></div>
          </div>
        )}

        <div className="live-classes">
        {groups.map((g) => {
          const col = classColor(g.cls);
          const shown = (c: Car) => {
            const done = c.sector === 1 && c.lapTime != null && c.lapTime < 10; // gerade ueber die Linie
            const sec = c.sector ?? 1;
            return [
              { v: done ? c.lastS1 : sec >= 2 ? c.curS1 : c.lastS1, fresh: done || sec >= 2 },
              { v: done ? c.lastS2 : sec === 3 ? c.curS2 : c.lastS2, fresh: done || sec === 3 },
              { v: c.lastS3, fresh: done },
            ];
          };
          const best = [0, 1, 2].map((n) =>
            g.rows.reduce<number | null>((m, r) => {
              const v = shown(r.car)[n].v;
              return v != null && (m == null || v < m) ? v : m;
            }, null),
          );
          const secCell = (c: Car, n: number) => {
            const { v, fresh } = shown(c)[n];
            return <td className={`num sec${fresh ? (v != null && best[n] === v ? " best" : "") : " old"}`} title={fresh ? "Sektor in dieser Runde beendet" : "Zeit der letzten Runde"}>{fmtTime(v)}</td>;
          };
          return (
            <div key={g.cls} className="cls-card">
              <div className="cls-head">
                <div className="cls-tab" style={{ background: col }}>{classLabel(g.cls)}</div>
                <span>{g.rows.length} {g.rows.length === 1 ? "Auto" : "Autos"}</span>
              </div>
              <div className="tablewrap" style={{ border: 0, borderRadius: 0, background: "transparent" }}>
                <table className="plain">
                  <thead>
                    <tr>
                      <th className="num">#</th><th className="ctr">Auto</th><th>Fahrer</th><th className="num">Runden</th>
                      <th className="num">S1</th><th className="num">S2</th><th className="num">S3</th>
                      <th className="num">Beste</th><th className="num">Letzte</th>
                      <th className="num">{kind === "race" ? "Abstand" : "Rückstand"}</th>{kind === "race" && <th className="num">Intervall</th>}
                      <th className="ctr">Reifen</th><th className="num">Stopps</th><th className="ctr">Status</th><th className="num">km/h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.car.id} className={r.car.yellowCause ? "yellow" : r.car.player ? "player" : ""}>
                        <td className="num">{r.classPos}</td>
                        <td className="ctr"><span className="carno">{r.car.num ?? "–"}</span></td>
                        <td>{r.car.driver}</td>
                        <td className="num">{r.car.laps}</td>
                        {secCell(r.car, 0)}{secCell(r.car, 1)}{secCell(r.car, 2)}
                        <td className="num">{fmtTime(r.car.bestLap)}</td>
                        <td className="num">{fmtTime(r.car.lastLap)}</td>
                        <td className="num gapred">{r.classPos === 1 ? "–" : r.gapLeader || fmtGap(r.car.gapLeader)}</td>
                        {kind === "race" && <td className="num gapred">{r.classPos === 1 ? "–" : r.gapInterval}</td>}
                        <td className="ctr"><Tires tire={r.car.tire} /></td>
                        <td className="num">{r.car.pitStops}</td>
                        <td className="ctr">
                          {r.car.finish === 3 ? <span className="pill dq">DQ</span> : r.car.inPits ? <span className="pill pit">PIT</span> : r.car.yellowCause ? <span className="pill yel">GELB</span> : <span className="pill run">RUN</span>}
                          {r.car.penalties > 0 && <span className="tag cls" style={{ marginLeft: 6 }}>{r.car.penalties} Str.</span>}
                        </td>
                        <td className="num">{r.car.speedKmh != null ? Math.round(r.car.speedKmh) : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {snapshot && (
          <div style={{ marginTop: 4 }}>
            <button onClick={() => setRaw((v) => !v)}>{raw ? "Rohdaten ausblenden" : "Rohdaten anzeigen"}</button>
            {raw && <pre>{JSON.stringify({ ...snapshot, cars: snapshot.cars.slice(0, 2) }, null, 2)}</pre>}
          </div>
        )}
        </div>
      </div>

    </div>
  );
}
