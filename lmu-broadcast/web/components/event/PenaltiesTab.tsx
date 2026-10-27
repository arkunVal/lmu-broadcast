"use client";

import { useState } from "react";
import { PENALTY_STATUS, penaltyText, sameName, type EventDriver, type EventRow, type Penalty } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";
import PenaltyForm from "./PenaltyForm";

export default function PenaltiesTab({
  event, penalties, drivers, isStaff, myIngameName, reload,
}: {
  event: EventRow; penalties: Penalty[]; drivers: EventDriver[]; isStaff: boolean; myIngameName: string | null; reload: () => void;
}) {
  const supabase = getSupabase()!;
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const mine = penalties.filter((p) => sameName(p.ingame_name, myIngameName) && p.status !== "revoked");

  async function setStatus(id: string, status: Penalty["status"]) {
    setError("");
    const { error } = await supabase.from("penalties").update({ status }).eq("id", id);
    if (error) setError(error.message);
    reload();
  }

  return (
    <>
      {mine.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--warn)" }}>
          <b>Deine Strafen in diesem Event</b>
          {mine.map((p) => (
            <div key={p.id}>{penaltyText(p.kind, p.amount)} <span className="muted">{p.reason && `– ${p.reason}`} ({PENALTY_STATUS[p.status]})</span></div>
          ))}
        </div>
      )}
      {isStaff && (
        <div style={{ marginBottom: 12 }}>
          <button className="primary" onClick={() => setCreating((v) => !v)}>{creating ? "Abbrechen" : "Strafe vergeben"}</button>
          {creating && (
            <div className="panel" style={{ marginTop: 12 }}>
              <PenaltyForm eventId={event.id} drivers={drivers} onDone={() => { setCreating(false); reload(); }} />
            </div>
          )}
        </div>
      )}
      {error && <div className="err">{error}</div>}
      <div className="tablewrap">
        <table className="plain">
          <thead>
            <tr><th>Fahrer</th><th>Strafe</th><th>Begründung</th><th>Status</th>{isStaff && <th />}</tr>
          </thead>
          <tbody>
            {penalties.length === 0 && <tr><td colSpan={5} className="muted">Noch keine Strafen.</td></tr>}
            {penalties.map((p) => (
              <tr key={p.id} style={p.status === "revoked" ? { opacity: 0.5 } : undefined}>
                <td>{p.car_number != null && `#${p.car_number} `}{p.ingame_name}</td>
                <td><b>{penaltyText(p.kind, p.amount)}</b></td>
                <td className="brk">{p.reason || "–"}</td>
                <td><span className={`badge ${p.status === "issued" ? "open" : ""}`}>{PENALTY_STATUS[p.status]}</span></td>
                {isStaff && (
                  <td>
                    <div className="row">
                      {p.status === "issued" && <button onClick={() => setStatus(p.id, "served")}>Abgesessen</button>}
                      {p.status !== "revoked" && <button className="danger" onClick={() => setStatus(p.id, "revoked")}>Zurücknehmen</button>}
                      {p.status === "revoked" && <button onClick={() => setStatus(p.id, "issued")}>Wieder verhängen</button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
