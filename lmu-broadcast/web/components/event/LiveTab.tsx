"use client";

import { classColor, classLabel } from "@/lib/classes";
import { fmtClock, fmtTime, phaseName } from "@/lib/format";
import { INCIDENT_KINDS, type EventRow, type Incident } from "@/lib/labels";
import { buildGroups, sessionKind, sessionLabel } from "@/lib/standings";
import { useLiveData } from "@/lib/useLiveData";

export default function LiveTab({
  event, incidents, openIncident,
}: {
  event: EventRow; incidents: Incident[]; openIncident: (id: string) => void;
}) {
  const { snapshot, connection, receivedAt } = useLiveData(event.room ?? "");
  const hints = incidents.filter((i) => i.source === "auto" && i.status === "open").slice(0, 10);
  const age = receivedAt ? (Date.now() - receivedAt) / 1000 : null;
  const live = snapshot?.status === "live" && age !== null && age < 5;

  const groups = snapshot && live ? buildGroups(snapshot.cars, sessionKind(snapshot.session.type)) : [];
  const s = snapshot?.session;

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", alignItems: "start", gap: 16 }}>
      <div>
        {!event.room && <div className="notice">Für dieses Event ist kein Raumcode hinterlegt (Event-Einstellungen).</div>}
        {event.room && !live && (
          <div className="notice">
            {connection === "subscribed" ? "Warte auf Live-Daten vom Reader …" : "Verbinde …"}
          </div>
        )}
        {s && live && (
          <div className="panel facts">
            <div className="fact"><span>Strecke</span>{s.track}</div>
            <div className="fact"><span>Session</span>{sessionLabel(s.type)}</div>
            <div className="fact"><span>Phase</span>{phaseName(s.phase)}</div>
            <div className="fact"><span>Restzeit</span>{fmtClock(s.remaining)}</div>
            <div className="fact"><span>Gelb</span>{s.sectorFlags.some(Boolean) ? s.sectorFlags.map((f, i) => (f ? `S${i + 1}` : null)).filter(Boolean).join(" ") : "–"}</div>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.cls} className="tablewrap" style={{ marginBottom: 12 }}>
            <table className="plain">
              <thead>
                <tr>
                  <th colSpan={7} style={{ background: classColor(g.cls), color: "#fff" }}>{classLabel(g.cls)}</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.car.id} className={r.car.yellowCause ? "yellow" : ""}>
                    <td className="num">{r.classPos}</td>
                    <td className="num">{r.car.num ?? "–"}</td>
                    <td>{r.car.driver}</td>
                    <td className="num">{Math.round(r.car.speedKmh)} km/h</td>
                    <td className="num">{fmtTime(r.car.lastLap)}</td>
                    <td className="num">{r.classPos === 1 ? "" : r.gapLeader}</td>
                    <td>
                      {r.car.inPits && <span className="tag pit">BOX</span>} {r.car.yellowCause && <span className="tag yel">GELB</span>}
                      {r.car.penalties > 0 && <span className="tag cls"> {r.car.penalties} Str.</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="panel">
        <b>Neue Auto-Hinweise</b>
        <p className="muted" style={{ margin: "4px 0 8px", fontSize: 12 }}>Automatisch erkannt, unbestätigt. Bitte prüfen.</p>
        {hints.length === 0 && <div className="muted">Keine offenen Hinweise.</div>}
        {hints.map((h) => (
          <div key={h.id} className="row" style={{ justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
            <span>
              <b>{INCIDENT_KINDS[h.kind] ?? h.kind}</b>{" "}
              <span className="muted">
                {h.session_time != null && fmtClock(h.session_time)} {h.lap != null && `· R${h.lap}`}
              </span>
              <br />
              <span style={{ fontSize: 12 }}>
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
