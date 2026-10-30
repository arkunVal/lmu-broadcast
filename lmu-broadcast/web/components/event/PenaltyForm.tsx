"use client";

import { useState } from "react";
import { fmtClock } from "@/lib/format";
import { PENALTY_KINDS, PENALTY_REASONS, type EventDriver, type PenaltyKind } from "@/lib/labels";
import { useLive } from "@/lib/liveContext";
import { getSupabase } from "@/lib/supabase";

const OTHER = "__other__";

/** Strafe vergeben (Rennleitung). Fahrer kommen aus der Event-Fahrerliste oder werden frei eingetragen. */
export default function PenaltyForm({
  eventId,
  drivers,
  incidentId,
  names,
  lap: lapDefault,
  sessionTime,
  initialKind,
  initialAmount,
  onDone,
}: {
  eventId: string;
  drivers: EventDriver[];
  incidentId?: string;
  names?: string[]; // Vorschläge (z. B. Beteiligte des Vorfalls)
  lap?: number | null;
  sessionTime?: number | null;
  initialKind?: PenaltyKind;
  initialAmount?: number;
  onDone: () => void;
}) {
  const supabase = getSupabase()!;
  const [name, setName] = useState(names?.[0] ?? "");
  const [free, setFree] = useState(false);
  const [kind, setKind] = useState<PenaltyKind>(initialKind ?? "time");
  const [amount, setAmount] = useState(String(initialAmount ?? 5));
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState("");
  const [car, setCar] = useState("");
  const [lap, setLap] = useState(lapDefault != null ? String(lapDefault) : "");
  const [stamp, setStamp] = useState(sessionTime != null ? fmtClock(sessionTime) : "");
  const { snapshot, live, leaderLaps } = useLive();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unit = PENALTY_KINDS[kind].unit;
  const options = Array.from(new Set([...(names ?? []), ...drivers.map((d) => d.ingame_name)]));

  function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Bitte einen Fahrer wählen.");
      return;
    }
    setError("");
    setConfirming(true);
  }

  async function submit() {
    setConfirming(false);
    setBusy(true);
    setError("");
    const driver = drivers.find((d) => d.ingame_name.toLowerCase() === name.trim().toLowerCase());
    const stampSeconds = stamp
      .trim()
      .split(":")
      .reverse()
      .reduce((sum, part, i) => sum + (Number(part) || 0) * 60 ** i, 0);
    const { error } = await supabase.from("penalties").insert({
      event_id: eventId,
      incident_id: incidentId ?? null,
      ingame_name: name.trim(),
      car_number: car.trim() ? Number(car) || null : (driver?.car_number ?? null),
      kind,
      amount: unit ? Number(amount) || null : null,
      reason: [preset, reason.trim()].filter(Boolean).join(" – "),
      lap: lap.trim() ? Number(lap) || null : null,
      session_time: stamp.trim() && stampSeconds > 0 ? stampSeconds : null,
    });
    if (error) setError(error.message);
    else {
      setReason("");
      setPreset("");
      onDone();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={ask}>
      <div className="formhead">Strafe vergeben</div>
      <div className="grid2" style={{ gridTemplateColumns: "2fr 1fr 2fr" }}>
        <div>
          <label>Fahrer</label>
          <select
            value={free ? OTHER : name}
            onChange={(e) => {
              if (e.target.value === OTHER) { setFree(true); setName(""); }
              else { setFree(false); setName(e.target.value); }
            }}
          >
            <option value="">Fahrer wählen …</option>
            {options.map((n) => {
              const nr = drivers.find((d) => d.ingame_name.toLowerCase() === n.toLowerCase())?.car_number;
              return <option key={n} value={n}>{nr != null ? `#${nr} ` : ""}{n}</option>;
            })}
            <option value={OTHER}>Anderer Fahrer …</option>
          </select>
          {(free || (name && !options.includes(name))) && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="In-Game-Name" style={{ width: "100%", marginTop: 8 }} autoFocus={free} />
          )}
        </div>
        <div>
          <label>Startnummer</label>
          <input type="number" min={0} value={car} onChange={(e) => setCar(e.target.value)} placeholder={String(drivers.find((d) => d.ingame_name.toLowerCase() === name.trim().toLowerCase())?.car_number ?? "")} />
        </div>
        <div>
          <label>Strafe</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as PenaltyKind)}>
            {Object.entries(PENALTY_KINDS).map(([value, k]) => <option key={value} value={value}>{k.label}</option>)}
          </select>
        </div>
      </div>
      {unit && (
        <div style={{ maxWidth: 240 }}>
          <label>{unit}</label>
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: "100%" }} />
        </div>
      )}
      <label>Grund</label>
      <select value={preset} onChange={(e) => setPreset(e.target.value)}>
        <option value="">Grund wählen …</option>
        {PENALTY_REASONS.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.items.map((r) => <option key={r} value={r}>{r}</option>)}
          </optgroup>
        ))}
      </select>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Zusatz oder eigener Grund (optional)" style={{ width: "100%", marginTop: 8 }} />
      <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label>Runde</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input type="number" min={0} value={lap} onChange={(e) => setLap(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button type="button" disabled={leaderLaps == null} onClick={() => leaderLaps != null && setLap(String(leaderLaps + 1))} title="Aktuelle Runde des Führenden">Führung</button>
          </div>
        </div>
        <div>
          <label>Zeitstempel (Session-Zeit)</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input value={stamp} onChange={(e) => setStamp(e.target.value)} placeholder="h:mm:ss" style={{ flex: 1, minWidth: 0 }} />
            <button type="button" disabled={!live || !snapshot} onClick={() => snapshot && setStamp(fmtClock(snapshot.session.time))} title="Aktuelle Session-Zeit aus dem Spiel">Jetzt</button>
          </div>
        </div>
      </div>
      {error && <div className="err">{error}</div>}
      <div style={{ marginTop: 16 }}><button className="issue" disabled={busy}>Strafe verhängen</button></div>
      {confirming && (
        <div className="modal-bg" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="formhead" style={{ color: "var(--bad)" }}>Strafe bestätigen</div>
            <dl className="kv">
              <dt>Fahrer</dt><dd>{name.trim()}</dd>
              <dt>Startnummer</dt><dd>{car.trim() || drivers.find((d) => d.ingame_name.toLowerCase() === name.trim().toLowerCase())?.car_number || "–"}</dd>
              <dt>Strafe</dt><dd>{PENALTY_KINDS[kind].label}{unit && amount ? `, ${amount} ${unit}` : ""}</dd>
              <dt>Grund</dt><dd>{[preset, reason.trim()].filter(Boolean).join(" – ") || "–"}</dd>
              <dt>Runde / Zeit</dt><dd>{lap || "–"} / {stamp || "–"}</dd>
            </dl>
            <div className="row" style={{ marginTop: 14 }}>
              <button type="button" onClick={() => setConfirming(false)}>Abbrechen</button>
              <button type="button" className="issue" onClick={submit}>Strafe verhängen</button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
