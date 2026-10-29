"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { sameName, type EventDriver, type EventRow, type Incident, type Penalty } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

const STATUS: Record<string, string> = { planned: "Geplant", live: "Live", finished: "Beendet" };

type Member = { joined_at: string; profiles: { display_name: string; ingame_name: string | null } | null };

export default function OverviewTab({
  event, drivers, isStaff, isAdmin,
}: {
  event: EventRow; incidents: Incident[]; penalties: Penalty[]; drivers: EventDriver[];
  isStaff: boolean; isAdmin: boolean; go: (tab: string) => void;
}) {
  const [coverage, setCoverage] = useState<number | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!event.track_slug) {
      setCoverage(null);
      return;
    }
    getSupabase()!.from("tracks").select("coverage").eq("slug", event.track_slug).maybeSingle()
      .then(({ data }) => setCoverage(data ? Number((data as { coverage: number }).coverage) : null));
  }, [event.track_slug]);

  useEffect(() => {
    getSupabase()!
      .from("event_members")
      .select("joined_at, profiles(display_name, ingame_name)")
      .eq("event_id", event.id)
      .order("joined_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setMembers((data as unknown as Member[]) ?? []);
      });
  }, [event.id]);

  const rows = (members ?? []).map((m) => {
    const name = m.profiles?.ingame_name || m.profiles?.display_name || "–";
    const entry = drivers.find((d) => sameName(d.ingame_name, name));
    return { name, joined: m.joined_at, entry };
  });

  return (
    <>
      <div className="panel ovhead">
        <div className="facts">
          <div className="fact"><span>Strecke</span>{event.track ?? "noch offen"}</div>
          <div className="fact"><span>Findet statt</span>{event.starts_at ? new Date(event.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "ohne Termin"}</div>
          <div className="fact"><span>Status</span>{STATUS[event.status]}</div>
          {isStaff && <div className="fact"><span>Fahrer angemeldet</span>{members === null ? "…" : members.length}</div>}
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
        <div className="box-h"><h3>Angemeldete Fahrer{members ? ` (${rows.length})` : ""}</h3></div>
        <div className="box-b">
          {error && <div className="err" style={{ padding: "0 18px" }}>{error}</div>}
          {members !== null && rows.length === 0 ? (
            <p className="muted" style={{ padding: "14px 18px", margin: 0 }}>
              Noch kein Fahrer angemeldet. {isAdmin ? "Fahrer treten mit dem Event-Code oben rechts bei." : ""}
            </p>
          ) : (
            <div className="tablewrap">
              <table className="plain">
                <thead><tr><th className="num">#</th><th>Fahrer</th><th>Klasse</th><th>Team</th><th>Angemeldet am</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{r.entry?.car_number != null ? <span className="carno">{r.entry.car_number}</span> : "–"}</td>
                      <td><b>{r.name}</b></td>
                      <td>{r.entry?.car_class ?? "–"}</td>
                      <td>{r.entry?.team ?? "–"}</td>
                      <td>{new Date(r.joined).toLocaleDateString("de-DE", { dateStyle: "medium" })}</td>
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
