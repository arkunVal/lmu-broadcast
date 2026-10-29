"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import DeleteEvent from "@/components/event/DeleteEvent";
import { useAuth } from "@/lib/auth";
import type { EventRow } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";
import { trackSlug } from "@/lib/tracks";

const STATUS: Record<string, string> = { planned: "Geplant", live: "Live", finished: "Beendet" };
const OTHER = "__other__";

type TrackOpt = { slug: string; name: string };

function JoinEvent({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabase()!.rpc("join_event", { p_code: code });
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setMsg({ ok: true, text: "Du bist dem Event beigetreten." });
      setCode("");
      onJoined();
    }
    setBusy(false);
  }

  return (
    <form className="panel" onSubmit={join}>
      <h3>Einem Event beitreten</h3>
      <p className="muted" style={{ margin: "2px 0 8px" }}>Den Event-Code bekommst du von der Rennleitung. Du gibst ihn nur einmal pro Event ein.</p>
      <div className="row">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="EVT-XXXX-XXXX" required style={{ width: 240 }} />
        <button className="primary" disabled={busy}>Beitreten</button>
      </div>
      {msg && <div className={msg.ok ? "okmsg" : "err"}>{msg.text}</div>}
    </form>
  );
}

function NewEvent({ onCreated }: { onCreated: () => void }) {
  const supabase = getSupabase()!;
  const [tracks, setTracks] = useState<TrackOpt[]>([]);
  const [form, setForm] = useState({ name: "", track: "", other: "", starts_at: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("tracks").select("slug, name").order("name").then(({ data }) => setTracks((data as TrackOpt[]) ?? []));
  }, [supabase]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    let track: string | null = null;
    let slug: string | null = null;
    if (form.track === OTHER) {
      track = form.other.trim() || null;
      slug = track ? trackSlug(track) : null;
    } else if (form.track) {
      const t = tracks.find((x) => x.slug === form.track);
      track = t?.name ?? null;
      slug = t?.slug ?? null;
    }
    const { error } = await supabase.from("events").insert({
      name: form.name.trim(),
      track,
      track_slug: slug,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
    });
    if (error) setError(error.message);
    else {
      setForm({ name: "", track: "", other: "", starts_at: "" });
      onCreated();
    }
    setBusy(false);
  }

  return (
    <form className="panel" onSubmit={create}>
      <h3>Neues Event</h3>
      <div className="grid2">
        <div><label>Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div>
          <label>Strecke</label>
          <select value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })}>
            <option value="">Noch offen</option>
            {tracks.length > 0 && <optgroup label="Schon aufgezeichnet">{tracks.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</optgroup>}
            <option value={OTHER}>Andere Strecke …</option>
          </select>
        </div>
        {form.track === OTHER && (
          <div><label>Name der Strecke</label><input value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })} placeholder="wie im Spiel, z. B. Circuit de la Sarthe" /></div>
        )}
        <div><label>Start</label><input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
        {tracks.length === 0
          ? "Noch keine Strecke aufgezeichnet. Das passiert automatisch, sobald der Reader eine Strecke zum ersten Mal sieht."
          : "Neue Strecken erscheinen hier automatisch, sobald der Reader sie einmal gefahren und aufgezeichnet hat."}
      </p>
      {error && <div className="err">{error}</div>}
      <div style={{ marginTop: 12 }}><button className="primary" disabled={busy}>Event anlegen</button></div>
    </form>
  );
}

function EventList() {
  const { profile } = useAuth();
  const supabase = getSupabase()!;
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("events")
      .select("id, name, track, track_slug, code, room, starts_at, status")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setEvents((data as EventRow[]) ?? []);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = profile?.role === "admin";
  return (
    <>
      <div className="page-title"><h1>Events</h1></div>
      {isAdmin && <NewEvent onCreated={load} />}
      {profile?.role === "driver" && <JoinEvent onJoined={load} />}
      {error && <div className="err">{error}</div>}
      {loaded && events.length === 0 ? (
        <div className="notice">
          {isAdmin
            ? "Noch keine Events. Lege oben das erste an."
            : profile?.role === "driver"
              ? "Du bist noch bei keinem Event dabei. Gib oben den Event-Code ein."
              : "Noch keine Events. Ein Admin legt Events an."}
        </div>
      ) : (
        <div className="tablewrap">
          <table className="plain">
            <thead>
              <tr><th>Event</th><th>Strecke</th><th>Start</th><th>Status</th>{isAdmin && <th />}</tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td><Link href={`/events/${ev.id}`}><b>{ev.name}</b></Link></td>
                  <td>{ev.track ?? "–"}</td>
                  <td>{ev.starts_at ? new Date(ev.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–"}</td>
                  <td><span className={`badge ${ev.status === "live" ? "live" : ""}`}>{STATUS[ev.status]}</span></td>
                  {isAdmin && <td style={{ textAlign: "right" }}><DeleteEvent id={ev.id} name={ev.name} compact onDeleted={load} /></td>}
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
