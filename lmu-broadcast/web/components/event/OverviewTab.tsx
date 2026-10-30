"use client";

import { useEffect, useState } from "react";
import CarNo from "@/components/CarNo";
import CopyButton from "@/components/CopyButton";
import { type EventDriver, type EventRow, type Incident, type Penalty } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

const STATUS: Record<string, string> = { planned: "Geplant", live: "Live", finished: "Beendet" };

export default function OverviewTab({
  event, drivers, isStaff, isAdmin,
}: {
  event: EventRow; incidents: Incident[]; penalties: Penalty[]; drivers: EventDriver[];
  isStaff: boolean; isAdmin: boolean; go: (tab: string) => void;
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

  return (
    <>
      <div className="panel ovhead">
        <div className="facts">
          <div className="fact"><span>Strecke</span>{event.track ?? "noch offen"}</div>
          <div className="fact"><span>Findet statt</span>{event.starts_at ? new Date(event.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "ohne Termin"}</div>
          <div className="fact"><span>Status</span>{STATUS[event.status]}</div>
          <div className="fact"><span>Fahrer</span>{registered} angemeldet{drivers.length > registered ? `, ${drivers.length - registered} eingetragen` : ""}</div>
          <div className="fact"><span>Art</span>{event.is_team_event ? "Team-Event" : "Einzel"}{(event.classes ?? []).length > 0 ? ` · ${(event.classes ?? []).join(", ")}` : ""}</div>
          <div className="fact">
            <span>Streckenkarte</span>
            {coverage === undefined ? "…" : coverage === null ? "noch nicht aufgezeichnet" : `gespeichert (${Math.round(coverage * 100)} %)`}
          </div>
        </div>
        {isAdmin && (
          <div className="ovcode">
            <span className="lbl">Event-Code für Fahrer</span>
            <div className="row" style={{ flexWrap: "nowrap" }}><span className="codebox">{event.code}</span><CopyButton text={event.code} /></div>
          </div>
        )}
      </div>

      <div className="panel box grow">
        <div className="box-h"><h3>Angemeldete Fahrer ({rows.length})</h3></div>
        <div className="box-b">
          {rows.length === 0 ? (
            <p className="muted" style={{ padding: "14px 18px", margin: 0 }}>
              Noch kein Fahrer angemeldet. {isAdmin ? "Fahrer treten mit dem Event-Code oben rechts bei." : ""}
            </p>
          ) : (
            <div className="tablewrap">
              <table className="plain">
                <thead><tr><th className="num">#</th><th>Fahrer</th><th>Klasse</th><th>Team</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="num">{r.car_number != null ? <CarNo num={r.car_number} cls={r.car_class} /> : "–"}</td>
                      <td><b>{r.ingame_name}</b>{r.is_captain ? <span className="muted"> · Kapitän</span> : null}</td>
                      <td>{r.car_class ?? "–"}</td>
                      <td>{r.team ?? "–"}</td>
                      <td>{r.profile_id ? "angemeldet" : <span className="muted">noch nicht beigetreten</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
