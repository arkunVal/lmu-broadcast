"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { fmtClock } from "@/lib/format";
import type { EventDriver, EventRow, Incident, Penalty } from "@/lib/labels";
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

  const open = incidents.filter((i) => i.status !== "closed");
  const hints = open.filter((i) => i.source === "auto");
  const lastIncidents = incidents.slice(0, 4);

  return (
    <>
      <div className="grid3" style={{ marginBottom: 16 }}>
        {isStaff && (
          <div className="panel" style={{ margin: 0 }}>
            <div className="stat">{open.length}</div>
            <div className="stat-lbl">offene Vorfälle{hints.length > 0 ? `, davon ${hints.length} automatisch` : ""}</div>
            <button style={{ marginTop: 10 }} onClick={() => go("incidents")}>Zu den Vorfällen</button>
          </div>
        )}
        <div className="panel" style={{ margin: 0 }}>
          <div className="stat">{penalties.filter((p) => p.status !== "revoked").length}</div>
          <div className="stat-lbl">Strafen</div>
          <button style={{ marginTop: 10 }} onClick={() => go("penalties")}>Zu den Strafen</button>
        </div>
        <div className="panel" style={{ margin: 0 }}>
          <div className="stat">{drivers.length}</div>
          <div className="stat-lbl">Fahrer in der Starterliste</div>
          <button style={{ marginTop: 10 }} onClick={() => go("drivers")}>Zur Starterliste</button>
        </div>
      </div>

      <div className="panel">
        <div className="facts">
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
            Fahrer registrieren sich, wählen die Rolle „Fahrer“ und geben diesen Code ein. Bestehende Konten treten unter „Events“ bei.
          </p>
          <div className="row"><span className="codebox">{event.code}</span><CopyButton text={event.code} /></div>
        </div>
      )}

      {isStaff && lastIncidents.length > 0 && (
        <div className="panel flat">
          <div className="tablewrap" style={{ border: 0 }}>
            <table className="plain">
              <thead><tr><th>Letzte Vorfälle</th><th>Zeit</th><th>Status</th></tr></thead>
              <tbody>
                {lastIncidents.map((i) => (
                  <tr key={i.id} className="click" onClick={() => go("incidents")}>
                    <td className="brk">{i.description || "–"}</td>
                    <td>{i.session_time != null ? fmtClock(i.session_time) : "–"}</td>
                    <td><span className={`badge ${i.status === "closed" ? "closed" : "open"}`}>{i.status === "closed" ? "Abgeschlossen" : "Offen"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
