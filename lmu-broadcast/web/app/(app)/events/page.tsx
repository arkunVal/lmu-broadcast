"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RegisterForm from "@/components/RegisterForm";
import RequireAuth from "@/components/RequireAuth";
import DeleteEvent from "@/components/event/DeleteEvent";
import { useAuth } from "@/lib/auth";
import type { EventRow } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";
import { trackSlug } from "@/lib/tracks";

const STATUS: Record<string, string> = { planned: "Geplant", live: "Live", finished: "Beendet" };
const OTHER = "__other__";

type TrackOpt = { slug: string; name: string };
const PRESET_CLASSES = ["Hypercar", "LMP2", "LMGT3", "GT3", "LMP3"];

function parseClasses(picked: string[], custom: string): string[] {
  const all = [...picked, ...custom.split(/[,;\n]/).map((c) => c.trim()).filter(Boolean)];
  return all.filter((c, i) => all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i);
}

function JoinEvent({ onJoined }: { onJoined: () => void }) {
  return (
    <div className="panel">
      <h3>Für ein Event anmelden</h3>
      <p className="muted" style={{ margin: "2px 0 8px" }}>Event-Code, Klasse und Startnummer. Bei Team-Events meldest du dein Team an oder trittst als Mitglied bei.</p>
      <RegisterForm onDone={onJoined} />
    </div>
  );
}

function NewEvent({ onCreated }: { onCreated: () => void }) {
  const supabase = getSupabase()!;
  const [tracks, setTracks] = useState<TrackOpt[]>([]);
  const [form, setForm] = useState({ name: "", track: "", other: "", starts_at: "" });
  const [picked, setPicked] = useState<string[]>(["Hypercar", "LMP2", "LMGT3"]);
  const [customClasses, setCustomClasses] = useState("");
  const [teamEvent, setTeamEvent] = useState(false);
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
      classes: parseClasses(picked, customClasses),
      is_team_event: teamEvent,
    });
    if (error) setError(error.message);
    else {
      setForm({ name: "", track: "", other: "", starts_at: "" });
      setCustomClasses("");
      setTeamEvent(false);
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
      <label>Klassen (Fahrer wählen bei der Anmeldung eine davon)</label>
      <div className="row">
        {PRESET_CLASSES.map((c) => (
          <button type="button" key={c} className={picked.includes(c) ? "primary" : ""} style={{ padding: "4px 12px", fontSize: 13 }}
            onClick={() => setPicked(picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c])}>{c}</button>
        ))}
      </div>
      <input value={customClasses} onChange={(e) => setCustomClasses(e.target.value)} placeholder="weitere Klassen, mit Komma getrennt" style={{ width: "100%", marginTop: 8 }} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0, fontSize: 14, color: "var(--text)", cursor: "pointer" }}>
        <input type="checkbox" checked={teamEvent} onChange={(e) => setTeamEvent(e.target.checked)} style={{ width: 18, height: 18 }} />
        Team-Event (Fahrer melden sich als Team mit Teammitgliedern an)
      </label>
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
  const isDriver = profile?.role === "driver";
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Events</h1>
          <p>{isAdmin ? "Events anlegen, öffnen und verwalten" : isDriver ? "Deine Events" : "Alle Events"}</p>
        </div>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="tabbody">
        <div className={isAdmin || isDriver ? "split evs" : "split full"}>
          {isAdmin && <NewEvent onCreated={load} />}
          {isDriver && <JoinEvent onJoined={load} />}
          <div className="scrollarea">
            {loaded && events.length === 0 ? (
              <div className="notice">
                {isAdmin
                  ? "Noch keine Events. Lege links das erste an."
                  : isDriver
                    ? "Du bist noch bei keinem Event dabei. Gib links den Event-Code ein."
                    : "Noch keine Events. Ein Admin legt Events an."}
              </div>
            ) : (
              <div className="evgrid">
                {events.map((ev) => (
                  <div className="evcard" key={ev.id}>
                    <div className="evtop">
                      <span className={`badge ${ev.status === "live" ? "live" : ""}`}>{STATUS[ev.status]}</span>
                      <span>{ev.starts_at ? new Date(ev.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "ohne Termin"}</span>
                    </div>
                    <Link href={`/events/${ev.id}`} className="evname">{ev.name}</Link>
                    <div className="muted">{ev.track ?? "Strecke noch offen"}</div>
                    <div className="evfoot">
                      <Link href={`/events/${ev.id}`} className="btn primary">Öffnen</Link>
                      {isAdmin && <DeleteEvent id={ev.id} name={ev.name} compact onDeleted={load} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
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
