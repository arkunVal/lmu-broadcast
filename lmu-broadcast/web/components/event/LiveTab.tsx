"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { sendCommand } from "@/lib/commands";
import { getSupabase } from "@/lib/supabase";
import HintButtons from "./HintButtons";
import { pickFocus } from "@/lib/focus";
import ReplayLink from "./ReplayLink";
import CarNo from "@/components/CarNo";
import Tires from "@/components/Tires";
import TrackMap from "@/components/TrackMap";
import { classColor, classLabel } from "@/lib/classes";
import { fmtClock, fmtGap, fmtTime } from "@/lib/format";
import { INCIDENT_KINDS, type EventDriver, type EventRow, type Incident } from "@/lib/labels";
import { buildGroups, sessionKind, sessionLabel } from "@/lib/standings";
import type { Car } from "@/lib/types";
import { useLive } from "@/lib/liveContext";

export default function LiveTab({
  event, incidents, drivers, openIncident, reload,
}: {
  event: EventRow; incidents: Incident[]; drivers: EventDriver[]; openIncident: (id: string) => void; reload: () => void;
}) {
  const { profile } = useAuth();
  const isStaff = profile?.role === "admin" || profile?.role === "steward";
  const canControl = isStaff || profile?.role === "broadcaster";
  const { snapshot, live, connection, setWatching } = useLive();
  const [picked, setPicked] = useState<number | null>(null);
  const [ctlMsg, setCtlMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ctlBusy, setCtlBusy] = useState(false);

  async function control(kindOf: "focus" | "live" | "next" | "prev", car?: Car) {
    const supabase = getSupabase();
    if (!supabase || ctlBusy) return;
    setCtlBusy(true);
    setCtlMsg(null);
    if (car) { setPicked(car.id); setWatching({ num: car.num, name: car.driver }); }
    const r = await sendCommand(supabase, event.id, kindOf === "focus" ? { kind: "focus", car: car?.num ?? null, driver: car?.driver ?? null } : { kind: kindOf });
    if (kindOf === "live") { setPicked(null); setWatching(null); }
    setCtlMsg(r);
    setCtlBusy(false);
  }
  const [raw, setRaw] = useState(false);

  const hints = incidents.filter((i) => i.source === "auto" && i.status === "open").slice(0, 10);
  const s = snapshot?.session;
  const kind = s ? sessionKind(s.type) : "race";
  const groups = snapshot && live ? buildGroups(snapshot.cars, kind) : [];
  const anyYellow = !!snapshot && live && snapshot.cars.some((c) => c.yellowCause);

  const teamOf = (c: Car) => drivers.find((d) => (c.num != null && d.car_number === c.num) || d.ingame_name.toLowerCase() === String(c.driver).toLowerCase())?.team ?? "";

  return (
    <div className="live-grid">
      <div className="live-top">
        <TrackMap snapshot={live ? snapshot : null} panel />
        <div className="live-info">
          {canControl ? (
            <div className="camrow">
              <span className="lbl">Kamera</span>
              <button onClick={() => control("prev")} disabled={ctlBusy} title="Vorheriges Auto im Spiel anwählen">◀ Voriges Auto</button>
              <button onClick={() => control("next")} disabled={ctlBusy} title="Nächstes Auto im Spiel anwählen">Nächstes Auto ▶</button>
              <button onClick={() => control("live")} disabled={ctlBusy} title="Das Spiel verlässt das Replay und zeigt wieder das Live-Bild. Ein Klick auf ein Auto in der Tabelle stellt die Kamera im Spiel darauf.">↩ Zurück zu Live</button>
              {ctlBusy && <span className="muted" style={{ fontSize: 13 }}>Sende …</span>}
              {ctlMsg && <span className={ctlMsg.ok ? "okmsg" : "err"} style={{ margin: 0 }}>{ctlMsg.ok ? "✓ " : ""}{ctlMsg.text}</span>}
            </div>
          ) : null}
          {anyYellow && <div className="banner" style={{ margin: 0 }}>Gelb: Ein Fahrzeug steht auf der Strecke und könnte Gelb auslösen.</div>}
          {!live && (
            <div className="notice" style={{ margin: 0 }}>
              {connection === "subscribed"
                ? "Warte auf Live-Daten. Läuft der Reader mit dem Reader-Key dieses Events? Den Key findest du unter „Einstellungen“."
                : "Verbinde …"}
            </div>
          )}
          {isStaff && (
            <div className="panel hints">
              <h3 title="„Ist Vorfall“ übernimmt in Bearbeitung, „Kein Vorfall“ löscht den Hinweis">Auto-Hinweise ({hints.length})</h3>
              {hints.length === 0 ? (
                <div className="muted">Keine offenen Hinweise.</div>
              ) : (
                <table className="plain">
                  <thead><tr><th>Art</th><th className="num">Runde</th><th>Beteiligte</th><th>Replay</th><th /></tr></thead>
                  <tbody>
                    {hints.map((h) => (
                      <tr key={h.id}>
                        <td><b>{INCIDENT_KINDS[h.kind] ?? h.kind}</b></td>
                        <td className="num">{h.lap ?? "–"}</td>
                        <td>{h.incident_drivers.map((d) => `${d.car_number != null ? `#${d.car_number} ` : ""}${d.ingame_name}${d.role === "possible" ? " (?)" : ""}`).join(", ") || "–"}</td>
                        <td><ReplayLink event={event} sessionTime={h.session_time} focus={pickFocus(h)} small noCopy /></td>
                        <td><HintButtons id={h.id} reload={reload} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

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
                      <th className="num">#</th><th className="ctr">Auto</th><th>Fahrer</th><th>Team</th><th className="num">Runden</th>
                      <th className="num">S1</th><th className="num">S2</th><th className="num">S3</th>
                      <th className="num">Beste</th><th className="num">Letzte</th>
                      <th className="num">{kind === "race" ? "Abstand" : "Rückstand"}</th>{kind === "race" && <th className="num">Intervall</th>}
                      <th className="ctr">Reifen</th><th className="num">Stopps</th><th className="ctr">Status</th><th className="num">km/h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.car.id} className={`${r.car.yellowCause ? "yellow" : r.car.player ? "player" : ""}${canControl ? " pick" : ""}${picked === r.car.id ? " picked" : ""}`} onClick={canControl ? () => control("focus", r.car) : undefined} title={canControl ? "Kamera im Spiel auf dieses Auto stellen" : undefined}>
                        <td className="num">{r.classPos}</td>
                        <td className="ctr"><CarNo num={r.car.num} cls={r.car.cls} /></td>
                        <td>{r.car.driver}</td>
                        <td className="muted">{teamOf(r.car) || "–"}</td>
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
  );
}
