"use client";

import { useEffect, useState } from "react";
import Roster from "./Roster";
import CopyButton from "@/components/CopyButton";
import { PENALTY_STATUS, penaltyText, type EventDriver, type EventRow, type Incident, type Penalty } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

const STATUS: Record<string, string> = { planned: "Geplant", live: "Live", finished: "Beendet" };

export default function OverviewTab({
  event, incidents, penalties, drivers, isStaff, isAdmin, go, reload,
}: {
  event: EventRow; incidents: Incident[]; penalties: Penalty[]; drivers: EventDriver[];
  isStaff: boolean; isAdmin: boolean; go: (tab: string) => void; reload?: () => void;
}) {
  const [coverage, setCoverage] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!event.track_slug) {
      setCoverage(null);
      return;
    }
    getSupabase()!.from("tracks").select("coverage").eq("slug", event.track_slug).maybeSingle()
      .then(({ data }) => setCoverage(data ? Number((data as { coverage: number }).coverage) : null));
  }, [event.track_slug]);

  const rows = [...drivers].sort((a, b) =>
    (a.car_class ?? "~").localeCompare(b.car_class ?? "~") || (a.car_number ?? 9999) - (b.car_number ?? 9999) || a.ingame_name.localeCompare(b.ingame_name));
  const registered = drivers.filter((d) => d.profile_id).length;
  const teams = new Set(drivers.map((d) => d.team_id ?? d.team).filter(Boolean)).size;
  const classes = new Set(drivers.map((d) => d.car_class).filter(Boolean)).size;
  const openInc = incidents.filter((i) => i.status !== "closed" && !(i.source === "auto" && i.status === "open")).length;
  const penActive = penalties.filter((p) => p.status !== "revoked").length;
  const recent = penalties.filter((p) => p.status !== "revoked").slice(0, 6);

  const tile = (n: string | number, label: string, tab?: string) => (
    <button className="statcard" onClick={tab ? () => go(tab) : undefined} style={tab ? undefined : { cursor: "default" }}>
      <div className="stat-n">{n}</div>
      <div className="stat-lbl muted">{label}</div>
    </button>
  );

  return (
    <>
      <div className="statrow">
        {tile(registered, `Fahrer angemeldet${drivers.length > registered ? ` (+${drivers.length - registered} eingetragen)` : ""}`)}
        {tile(teams || "–", event.is_team_event ? "Teams" : "Teams (Einzel-Event)")}
        {tile(classes || "–", "Klassen")}
        {isStaff ? tile(openInc, "Vorfälle offen", "incidents") : tile(penActive, "Strafen verhängt", "penalties")}
        {isStaff && tile(penActive, "Strafen verhängt", "penalties")}
      </div>

      <div className="split b">
        <div className="col">
          <div className="panel">
            <div className="facts" style={{ flexDirection: "column", gap: 12 }}>
              <div className="fact"><span>Strecke</span>{event.track ?? "noch offen"}</div>
              <div className="fact"><span>Findet statt</span>{event.starts_at ? new Date(event.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "ohne Termin"}</div>
              <div className="fact"><span>Status</span>{STATUS[event.status]}</div>
              <div className="fact"><span>Art</span>{event.is_team_event ? "Team-Event" : "Einzel"}{(event.classes ?? []).length > 0 ? ` · ${(event.classes ?? []).join(", ")}` : ""}</div>
              <div className="fact">
                <span>Streckenkarte</span>
                {coverage === undefined ? "…" : coverage === null ? "noch nicht aufgezeichnet" : `gespeichert (${Math.round(coverage * 100)} %)`}
              </div>
            </div>
            {isAdmin && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <span className="lbl muted" style={{ fontSize: 12 }}>Event-Code für Fahrer</span>
                <div className="row" style={{ flexWrap: "nowrap", marginTop: 6 }}><span className="codebox">{event.code}</span><CopyButton text={event.code} /></div>
              </div>
            )}
          </div>
          <div className="panel box grow">
            <div className="box-h"><h3>Letzte Strafen</h3></div>
            <div className="box-b">
              {recent.length === 0 ? (
                <p className="muted" style={{ padding: "12px 18px", margin: 0 }}>Noch keine Strafen.</p>
              ) : (
                <table className="plain">
                  <tbody>
                    {recent.map((p) => (
                      <tr key={p.id}>
                        <td>{p.car_number != null ? `#${p.car_number} ` : ""}{p.ingame_name}</td>
                        <td><b>{penaltyText(p.kind, p.amount)}</b></td>
                        <td><span className={`badge ${p.status === "issued" ? "open" : ""}`}>{PENALTY_STATUS[p.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="panel box grow">
          <div className="box-h"><h3>Angemeldete Fahrer ({rows.length}) · {new Set(rows.map((r) => r.team_id ?? r.team ?? r.id)).size} Teams</h3></div>
          <div className="box-b">
            <Roster drivers={rows} canRemove={isStaff} reload={reload} />
          </div>
        </div>
      </div>
    </>
  );
}
