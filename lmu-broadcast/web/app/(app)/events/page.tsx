"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import type { EventRow } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

const STATUS: Record<string, string> = { planned: "Geplant", live: "Live", finished: "Beendet" };

function EventList() {
  const { profile } = useAuth();
  const supabase = getSupabase()!;
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", track: "", room: "", starts_at: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("events")
      .select("id, name, track, room, starts_at, status")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setEvents((data as EventRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.from("events").insert({
      name: form.name.trim(),
      track: form.track.trim() || null,
      room: form.room.trim() || null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
    });
    if (error) setError(error.message);
    else {
      setForm({ name: "", track: "", room: "", starts_at: "" });
      await load();
    }
    setBusy(false);
  }

  return (
    <>
      {profile?.role === "admin" && (
        <form className="panel" onSubmit={create}>
          <b>Neues Event</b>
          <div className="grid2">
            <div><label>Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%" }} /></div>
            <div><label>Strecke</label><input value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })} style={{ width: "100%" }} /></div>
            <div><label>Raumcode des Readers (Live-Ansicht)</label><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} style={{ width: "100%" }} /></div>
            <div><label>Start</label><input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} style={{ width: "100%" }} /></div>
          </div>
          {error && <div className="err">{error}</div>}
          <div style={{ marginTop: 10 }}><button className="primary" disabled={busy}>Event anlegen</button></div>
        </form>
      )}
      {error && profile?.role !== "admin" && <div className="err">{error}</div>}
      {events.length === 0 ? (
        <div className="notice">Noch keine Events. {profile?.role === "admin" ? "Lege oben das erste an." : "Ein Admin legt Events an."}</div>
      ) : (
        <div className="tablewrap">
          <table className="plain">
            <thead>
              <tr><th>Event</th><th>Strecke</th><th>Start</th><th>Status</th></tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td><Link href={`/events/${ev.id}`}><b>{ev.name}</b></Link></td>
                  <td>{ev.track ?? "–"}</td>
                  <td>{ev.starts_at ? new Date(ev.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–"}</td>
                  <td><span className={`badge ${ev.status === "live" ? "open" : ""}`}>{STATUS[ev.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Events() {
  return (
    <RequireAuth>
      <EventList />
    </RequireAuth>
  );
}
