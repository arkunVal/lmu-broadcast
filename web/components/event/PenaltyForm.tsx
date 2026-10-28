"use client";

import { useState } from "react";
import { fmtClock } from "@/lib/format";
import { PENALTY_KINDS, PENALTY_REASONS, type EventDriver, type PenaltyKind } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

/** Strafe vergeben (Rennleitung). Fahrer kommen aus der Event-Fahrerliste oder werden frei eingetragen. */
export default function PenaltyForm({
  eventId,
  drivers,
  incidentId,
  names,
  lap: lapDefault,
  sessionTime,
  onDone,
}: {
  eventId: string;
  drivers: EventDriver[];
  incidentId?: string;
  names?: string[]; // Vorschläge (z. B. Beteiligte des Vorfalls)
  lap?: number | null;
  sessionTime?: number | null;
  onDone: () => void;
}) {
  const supabase = getSupabase()!;
  const [name, setName] = useState(names?.[0] ?? "");
  const [kind, setKind] = useState<PenaltyKind>("time");
  const [amount, setAmount] = useState("5");
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState("");
  const [car, setCar] = useState("");
  const [lap, setLap] = useState(lapDefault != null ? String(lapDefault) : "");
  const [stamp, setStamp] = useState(sessionTime != null ? fmtClock(sessionTime) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unit = PENALTY_KINDS[kind].unit;
  const options = Array.from(new Set([...(names ?? []), ...drivers.map((d) => d.ingame_name)]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Bitte einen Fahrer wählen.");
      return;
    }
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
    <form onSubmit={submit}>
      <div className="formhead">Strafe vergeben</div>
      <div className="grid2" style={{ gridTemplateColumns: "2fr 1fr 2fr" }}>
        <div>
          <label>Fahrer</label>
          <input list={`pen-drivers-${incidentId ?? "x"}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="In-Game-Name" />
          <datalist id={`pen-drivers-${incidentId ?? "x"}`}>
            {options.map((n) => <option key={n} value={n} />)}
          </datalist>
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
        <div><label>Runde</label><input type="number" min={0} value={lap} onChange={(e) => setLap(e.target.value)} /></div>
        <div><label>Zeitstempel (Session-Zeit)</label><input value={stamp} onChange={(e) => setStamp(e.target.value)} placeholder="h:mm:ss" /></div>
      </div>
      {error && <div className="err">{error}</div>}
      <div style={{ marginTop: 16 }}><button className="issue" disabled={busy}>Strafe verhängen</button></div>
    </form>
  );
}
