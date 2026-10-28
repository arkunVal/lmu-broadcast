"use client";

import { useMemo, useState } from "react";
import { fmtClock } from "@/lib/format";
import {
  CONFIDENCE, INCIDENT_KINDS, INCIDENT_STATUS, SESSION_TYPES, penaltyText,
  type EventDriver, type EventRow, type Incident, type Penalty,
} from "@/lib/labels";
import { sessionLabel } from "@/lib/standings";
import { getSupabase } from "@/lib/supabase";
import PenaltyForm from "./PenaltyForm";

function driversText(i: Incident): string {
  if (!i.incident_drivers.length) return "–";
  return i.incident_drivers
    .map((d) => `${d.car_number != null ? `#${d.car_number} ` : ""}${d.ingame_name}${d.role === "possible" ? " (?)" : ""}`)
    .join(", ");
}

function NewIncident({ event, drivers, onDone }: { event: EventRow; drivers: EventDriver[]; onDone: (id: string) => void }) {
  const supabase = getSupabase()!;
  const [kind, setKind] = useState("contact");
  const [sessionType, setSessionType] = useState(10);
  const [minutes, setMinutes] = useState("");
  const [lap, setLap] = useState("");
  const [description, setDescription] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const all = [...names, ...extra.split(",").map((s) => s.trim()).filter(Boolean)];
    const { data, error } = await supabase
      .from("incidents")
      .insert({
        event_id: event.id,
        source: "manual",
        kind,
        session_type: sessionType,
        session_time: minutes ? Number(minutes) * 60 : null,
        lap: lap ? Number(lap) : null,
        description: description.trim(),
      })
      .select("id")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Fehler");
      setBusy(false);
      return;
    }
    if (all.length) {
      const rows = all.map((n) => {
        const d = drivers.find((x) => x.ingame_name.toLowerCase() === n.toLowerCase());
        return { incident_id: data.id, ingame_name: n, car_number: d?.car_number ?? null, role: "involved" };
      });
      const r = await supabase.from("incident_drivers").insert(rows);
      if (r.error) setError(r.error.message);
    }
    setBusy(false);
    onDone(data.id);
  }

  return (
    <form className="panel" onSubmit={submit}>
      <b>Vorfall melden</b>
      <div className="grid2">
        <div>
          <label>Art</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(INCIDENT_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label>Session</label>
          <select value={sessionType} onChange={(e) => setSessionType(Number(e.target.value))}>
            {SESSION_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div><label>Minute der Session (optional)</label><input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ width: "100%" }} /></div>
        <div><label>Runde (optional)</label><input type="number" min={1} value={lap} onChange={(e) => setLap(e.target.value)} style={{ width: "100%" }} /></div>
      </div>
      <label>Beteiligte Fahrer</label>
      <select multiple value={names} onChange={(e) => setNames(Array.from(e.target.selectedOptions).map((o) => o.value))} style={{ minHeight: 90 }}>
        {drivers.map((d) => <option key={d.id} value={d.ingame_name}>{d.car_number != null ? `#${d.car_number} ` : ""}{d.ingame_name}</option>)}
      </select>
      <label>Weitere Namen (Komma getrennt, falls nicht in der Liste)</label>
      <input value={extra} onChange={(e) => setExtra(e.target.value)} style={{ width: "100%" }} />
      <label>Beschreibung</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <div className="err">{error}</div>}
      <div style={{ marginTop: 10 }}><button className="primary" disabled={busy}>Vorfall anlegen</button></div>
    </form>
  );
}

function Detail({
  incident, event, drivers, penalties, isStaff, reload,
}: {
  incident: Incident; event: EventRow; drivers: EventDriver[]; penalties: Penalty[]; isStaff: boolean; reload: () => void;
}) {
  const supabase = getSupabase()!;
  const [decision, setDecision] = useState(incident.decision ?? "");
  const [description, setDescription] = useState(incident.description);
  const [addName, setAddName] = useState("");
  const [showPenalty, setShowPenalty] = useState(false);
  const [error, setError] = useState("");
  const linked = penalties.filter((p) => p.incident_id === incident.id);

  async function setStatus(status: "open" | "reviewing" | "closed") {
    setError("");
    const { error } = await supabase
      .from("incidents")
      .update({
        status,
        decision: decision.trim() || null,
        description: description.trim(),
        closed_at: status === "closed" ? new Date().toISOString() : null,
      })
      .eq("id", incident.id);
    if (error) setError(error.message);
    reload();
  }

  async function removeDriver(id: string) {
    await supabase.from("incident_drivers").delete().eq("id", id);
    reload();
  }

  async function addDriver() {
    const n = addName.trim();
    if (!n) return;
    const d = drivers.find((x) => x.ingame_name.toLowerCase() === n.toLowerCase());
    const { error } = await supabase
      .from("incident_drivers")
      .insert({ incident_id: incident.id, ingame_name: n, car_number: d?.car_number ?? null, role: "involved" });
    if (error) setError(error.message);
    setAddName("");
    reload();
  }

  const details = Object.entries(incident.details ?? {});

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{INCIDENT_KINDS[incident.kind] ?? incident.kind}</b>
        <span className="row">
          {incident.source === "auto" && <span className="badge auto">Auto-Hinweis · Sicherheit {CONFIDENCE[incident.confidence ?? ""] ?? "?"}</span>}
          <span className={`badge ${incident.status}`}>{INCIDENT_STATUS[incident.status]}</span>
        </span>
      </div>
      <div className="muted" style={{ margin: "4px 0 8px" }}>
        {incident.session_type != null ? sessionLabel(incident.session_type) : "Session ?"}
        {incident.session_time != null && ` · ${fmtClock(incident.session_time)}`}
        {incident.lap != null && ` · Runde ${incident.lap}`}
        {incident.lap_dist != null && ` · ${Math.round(incident.lap_dist)} m`}
      </div>

      {isStaff ? (
        <>
          <label>Beschreibung</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </>
      ) : (
        <p>{incident.description || "–"}</p>
      )}

      {details.length > 0 && (
        <details style={{ margin: "8px 0" }}>
          <summary className="muted">Messwerte des Readers</summary>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {details.map(([k, v]) => <span key={k} style={{ marginRight: 14 }}><code>{k}</code> {String(v)}</span>)}
          </div>
        </details>
      )}

      <label>Beteiligte</label>
      <div className="row">
        {incident.incident_drivers.length === 0 && <span className="muted">keine erfasst</span>}
        {incident.incident_drivers.map((d) => (
          <span key={d.id} className="badge">
            {d.car_number != null && `#${d.car_number} `}{d.ingame_name}{d.role === "possible" && " (möglich)"}
            {isStaff && <button style={{ marginLeft: 6, padding: "0 6px" }} onClick={() => removeDriver(d.id)} title="Entfernen">×</button>}
          </span>
        ))}
      </div>
      {isStaff && (
        <div className="row" style={{ marginTop: 8 }}>
          <input list="inc-add-drivers" placeholder="Fahrer hinzufügen" value={addName} onChange={(e) => setAddName(e.target.value)} />
          <datalist id="inc-add-drivers">{drivers.map((d) => <option key={d.id} value={d.ingame_name} />)}</datalist>
          <button onClick={addDriver}>Hinzufügen</button>
        </div>
      )}

      <label>Entscheidung der Rennleitung</label>
      {isStaff ? <textarea value={decision} onChange={(e) => setDecision(e.target.value)} /> : <p>{incident.decision || "–"}</p>}

      {linked.length > 0 && (
        <>
          <label>Verhängte Strafen</label>
          {linked.map((p) => (
            <div key={p.id}>{p.ingame_name}: <b>{penaltyText(p.kind, p.amount)}</b> {p.reason && <span className="muted">– {p.reason}</span>}</div>
          ))}
        </>
      )}

      {error && <div className="err">{error}</div>}
      {isStaff && (
        <>
          <div className="row" style={{ marginTop: 12 }}>
            {incident.status !== "reviewing" && <button onClick={() => setStatus("reviewing")}>In Prüfung setzen</button>}
            {incident.status !== "closed" && <button className="primary" onClick={() => setStatus("closed")}>Abschließen &amp; veröffentlichen</button>}
            {incident.status === "closed" && <button onClick={() => setStatus("open")}>Wieder öffnen</button>}
            <button onClick={() => setStatus(incident.status)}>Text speichern</button>
            <button onClick={() => setShowPenalty((v) => !v)}>{showPenalty ? "Strafformular schließen" : "Strafe vergeben"}</button>
          </div>
          {showPenalty && (
            <div style={{ marginTop: 12 }}>
              <PenaltyForm
                eventId={event.id}
                drivers={drivers}
                incidentId={incident.id}
                names={incident.incident_drivers.map((d) => d.ingame_name)}
                onDone={() => { setShowPenalty(false); reload(); }}
              />
            </div>
          )}
          <p className="muted" style={{ fontSize: 12 }}>
            Fahrer sehen einen Vorfall erst, wenn er abgeschlossen ist.
          </p>
        </>
      )}
    </div>
  );
}

export default function IncidentsTab({
  event, incidents, drivers, penalties, isStaff, selectedId, setSelectedId, reload,
}: {
  event: EventRow; incidents: Incident[]; drivers: EventDriver[]; penalties: Penalty[]; isStaff: boolean;
  selectedId: string | null; setSelectedId: (id: string | null) => void; reload: () => void;
}) {
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [creating, setCreating] = useState(false);

  const shown = useMemo(
    () => incidents.filter((i) => (status === "all" || i.status === status) && (source === "all" || i.source === source)),
    [incidents, status, source],
  );
  const selected = incidents.find((i) => i.id === selectedId) ?? null;
  const openCount = incidents.filter((i) => i.status !== "closed").length;

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        {isStaff && (
          <>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}>
              <option value="all">Alle Status</option>
              {Object.entries(INCIDENT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)} style={{ width: "auto" }}>
              <option value="all">Alle Quellen</option>
              <option value="auto">Auto-Hinweise</option>
              <option value="manual">Manuell</option>
            </select>
            <span className="muted">{openCount} nicht abgeschlossen</span>
            <button className="primary" onClick={() => setCreating((v) => !v)}>{creating ? "Abbrechen" : "Vorfall melden"}</button>
          </>
        )}
        {!isStaff && <span className="muted">Hier erscheinen abgeschlossene Vorfälle mit der Entscheidung der Rennleitung.</span>}
      </div>

      {creating && isStaff && (
        <NewIncident event={event} drivers={drivers} onDone={(id) => { setCreating(false); setSelectedId(id); reload(); }} />
      )}

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", alignItems: "start", gap: 16 }}>
        <div className="tablewrap">
          <table className="plain">
            <thead>
              <tr><th>Zeit</th><th>Art</th><th>Beteiligte</th><th>Status</th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={4} className="muted">Keine Vorfälle.</td></tr>}
              {shown.map((i) => (
                <tr key={i.id} onClick={() => setSelectedId(i.id)} style={{ cursor: "pointer", background: i.id === selectedId ? "var(--sel)" : undefined }}>
                  <td>{i.session_time != null ? fmtClock(i.session_time) : "–"}{i.lap != null && <span className="muted"> · R{i.lap}</span>}</td>
                  <td>
                    {INCIDENT_KINDS[i.kind] ?? i.kind}{" "}
                    {i.source === "auto" && <span className="badge auto">Auto</span>}
                  </td>
                  <td className="brk">{driversText(i)}</td>
                  <td><span className={`badge ${i.status}`}>{INCIDENT_STATUS[i.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          {selected ? (
            <Detail key={selected.id + selected.status + selected.incident_drivers.length} incident={selected} event={event} drivers={drivers} penalties={penalties} isStaff={isStaff} reload={reload} />
          ) : (
            <div className="notice">Wähle links einen Vorfall aus.</div>
          )}
        </div>
      </div>
    </>
  );
}
