"use client";

import { useState } from "react";
import { PENALTY_KINDS, type EventDriver, type PenaltyKind } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

/** Strafe vergeben (Rennleitung). Fahrer kommen aus der Event-Fahrerliste oder werden frei eingetragen. */
export default function PenaltyForm({
  eventId,
  drivers,
  incidentId,
  names,
  onDone,
}: {
  eventId: string;
  drivers: EventDriver[];
  incidentId?: string;
  names?: string[]; // Vorschläge (z. B. Beteiligte des Vorfalls)
  onDone: () => void;
}) {
  const supabase = getSupabase()!;
  const [name, setName] = useState(names?.[0] ?? "");
  const [kind, setKind] = useState<PenaltyKind>("time");
  const [amount, setAmount] = useState("5");
  const [reason, setReason] = useState("");
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
    const { error } = await supabase.from("penalties").insert({
      event_id: eventId,
      incident_id: incidentId ?? null,
      ingame_name: name.trim(),
      car_number: driver?.car_number ?? null,
      kind,
      amount: unit ? Number(amount) || null : null,
      reason: reason.trim(),
    });
    if (error) setError(error.message);
    else {
      setReason("");
      onDone();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      <div className="grid2">
        <div>
          <label>Fahrer</label>
          <input list={`pen-drivers-${incidentId ?? "x"}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="In-Game-Name" style={{ width: "100%" }} />
          <datalist id={`pen-drivers-${incidentId ?? "x"}`}>
            {options.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>
        <div>
          <label>Strafe</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as PenaltyKind)}>
            {Object.entries(PENALTY_KINDS).map(([value, k]) => <option key={value} value={value}>{k.label}</option>)}
          </select>
        </div>
        {unit && (
          <div>
            <label>{unit}</label>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: "100%" }} />
          </div>
        )}
      </div>
      <label>Begründung</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <div className="err">{error}</div>}
      <div style={{ marginTop: 10 }}><button className="primary" disabled={busy}>Strafe verhängen</button></div>
    </form>
  );
}
