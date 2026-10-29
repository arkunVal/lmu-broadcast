"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { fmtClock } from "@/lib/format";
import { INCIDENT_STATUS, type EventDriver, type EventRow, type Incident, type Penalty } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

const STATUS: Record<string, string> = { planned: "Geplant", live: "Live", finished: "Beendet" };

export default function OverviewTab({
  event, incidents, penalties, drivers, isStaff, isAdmin, go,
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

  const hints = incidents.filter((i) => i.source === "auto" && i.status === "open"); // Hinweise, noch keine Vorfälle
  const open = incidents.filter((i) => i.status !== "closed" && !hints.includes(i));
  const lastIncidents = incidents.filter((i) => !hints.includes(i)).slice(0, 10);

  return (
    <div className={isStaff ? "split" : "split full"}>
      <div className="col">
        <div className="statrow">
          {isStaff && (
            <button className="statcard" onClick={() => go("incidents")}>
              <div className="stat">{open.length}</div>
              <div className="stat-lbl">offene Vorfälle{hints.length > 0 ? `, dazu ${hints.length} Auto-${hints.length === 1 ? "Hinweis" : "Hinweise"}` : ""}</div>
            </button>
          )}
          <button className="statcard" onClick={() => go("penalties")}>
            <div className="stat">{penalties.filter((p) => p.status !== "revoked").length}</div>
            <div className="stat-lbl">Strafen</div>
          </button>
          <button className="statcard" onClick={() => go("drivers")}>
            <div className="stat">{drivers.length}</div>
            <div className="stat-lbl">Fahrer in der Starterliste</div>
          </button>
        </div>

        <div className="panel">
          <h3>Event</h3>
          <div className="facts" style={{ marginTop: 10 }}>
            <div className="fact"><span>Strecke</span>{event.track ?? "noch offen"}</div>
            <div className="fact">
              <span>Streckenkarte</span>
              {coverage === undefined ? "…" : coverage === null ? "noch nicht aufgezeichnet" : `gespeichert (${Math.round(coverage * 100)} %)`}
            </div>
            <div className="fact"><span>Start</span>{event.starts_at ? new Date(event.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–"}</div>
            <div className="fact"><span>Status</span>{STATUS[event.status]}</div>
          </div>
          {coverage === null && event.track && (
            <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
              Die Karte wird vom Reader automatisch aufgenommen, sobald jemand mit laufendem Reader die Strecke fährt. Danach ist sie für alle künftigen Events da.
            </p>
          )}
        </div>

        {isAdmin && (
          <div className="panel">
            <h3>Event-Code für Fahrer</h3>
            <p className="muted" style={{ margin: "2px 0 10px" }}>
              Fahrer wählen bei der Anmeldung die Rolle „Fahrer“ und geben diesen Code ein. Bestehende Konten treten unter „Events“ bei.
            </p>
            <div className="row"><span className="codebox">{event.code}</span><CopyButton text={event.code} /></div>
          </div>
        )}
      </div>

      {isStaff && (
        <div className="panel box grow" style={{ minHeight: 0 }}>
          <div className="box-h"><h3>Letzte Vorfälle</h3><button onClick={() => go("incidents")}>Alle ansehen</button></div>
          <div className="box-b">
            {lastIncidents.length === 0 ? (
              <p className="muted" style={{ padding: "14px 18px", margin: 0 }}>Noch keine Vorfälle.</p>
            ) : (
              <div className="tablewrap">
                <table className="plain">
                  <thead><tr><th>Vorfall</th><th>Zeit</th><th>Status</th></tr></thead>
                  <tbody>
                    {lastIncidents.map((i) => (
                      <tr key={i.id} className="click" onClick={() => go("incidents")}>
                        <td className="brk">{i.description || "–"}</td>
                        <td>{i.session_time != null ? fmtClock(i.session_time) : "–"}</td>
                        <td><span className={`badge ${i.status === "closed" ? "closed" : "open"}`}>{INCIDENT_STATUS[i.status] ?? i.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
