"use client";

import { useState } from "react";
import CarNo from "@/components/CarNo";
import { INCIDENT_KINDS, PENALTY_STATUS, penaltyText, sameName, type EventDriver, type EventRow, type Incident, type Penalty } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";
import PenaltyForm from "./PenaltyForm";
import ReplayLink from "./ReplayLink";

export default function PenaltiesTab({
  event, penalties, drivers, incidents, isStaff, myIngameName, openIncident, reload,
}: {
  event: EventRow; penalties: Penalty[]; drivers: EventDriver[]; incidents: Incident[]; isStaff: boolean; myIngameName: string | null; openIncident: (id: string) => void; reload: () => void;
}) {
  const supabase = getSupabase()!;
  const [error, setError] = useState("");
  const mine = penalties.filter((p) => sameName(p.ingame_name, myIngameName) && p.status !== "revoked");

  async function setStatus(id: string, status: Penalty["status"]) {
    setError("");
    const { error } = await supabase.from("penalties").update({ status }).eq("id", id);
    if (error) setError(error.message);
    reload();
  }

  const table = (
    <div className="tablewrap">
      <table className="plain">
        <thead>
          <tr><th>Fahrer</th><th>Strafe</th><th>Begründung</th><th className="num">Runde</th>{isStaff && <th>Vorfall</th>}<th>Status</th>{isStaff && <th />}</tr>
        </thead>
        <tbody>
          {penalties.length === 0 && <tr><td colSpan={7} className="muted">Noch keine Strafen.</td></tr>}
          {penalties.map((p) => (
            <tr key={p.id} style={p.status === "revoked" ? { opacity: 0.5 } : undefined}>
              <td>{p.car_number != null && <CarNo num={p.car_number} cls={drivers.find((d) => d.car_number === p.car_number)?.car_class} />} {p.ingame_name}</td>
              <td><b>{penaltyText(p.kind, p.amount)}</b>{p.after_race && <span className="muted"> · nach dem Rennen</span>}</td>
              <td className="brk">{p.reason || "–"}</td>
              <td className="num">{p.lap ?? "–"}{p.session_time != null && <> <ReplayLink event={event} sessionTime={p.session_time} focus={{ num: p.car_number, name: p.ingame_name }} small /></>}</td>
              {isStaff && (
                <td>{p.incident_id ? <button style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => openIncident(p.incident_id!)}>{INCIDENT_KINDS[incidents.find((i) => i.id === p.incident_id)?.kind ?? ""] ?? "Vorfall"}</button> : <span className="muted">–</span>}</td>
              )}
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
  );

  const mineBox = mine.length > 0 && (
    <div className="panel pen">
      <b>Deine Strafen in diesem Event</b>
      {mine.map((p) => (
        <div key={p.id}>{penaltyText(p.kind, p.amount)} <span className="muted">{p.reason && `– ${p.reason}`} ({PENALTY_STATUS[p.status]})</span></div>
      ))}
    </div>
  );

  if (!isStaff) {
    return (
      <>
        {mineBox}
        {error && <div className="err">{error}</div>}
        {table}
      </>
    );
  }
  return (
    <div className="split b">
      <div className="panel">
        <PenaltyForm eventId={event.id} drivers={drivers} onDone={reload} />
      </div>
      <div className="col">
        {error && <div className="err">{error}</div>}
        {table}
      </div>
    </div>
  );
}
