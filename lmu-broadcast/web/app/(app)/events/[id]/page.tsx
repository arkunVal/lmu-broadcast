"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import DriversTab from "@/components/event/DriversTab";
import IncidentsTab from "@/components/event/IncidentsTab";
import LiveTab from "@/components/event/LiveTab";
import PenaltiesTab from "@/components/event/PenaltiesTab";
import { useAuth } from "@/lib/auth";
import { useEventData } from "@/lib/eventData";
import type { EventRow } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

type Tab = "live" | "incidents" | "penalties" | "drivers";

function Settings({ event, onSaved }: { event: EventRow; onSaved: () => void }) {
  const supabase = getSupabase()!;
  const [room, setRoom] = useState(event.room ?? "");
  const [status, setStatus] = useState(event.status);
  const [token, setToken] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("event_secrets").select("ingest_token").eq("event_id", event.id).maybeSingle()
      .then(({ data }) => setToken((data as { ingest_token: string } | null)?.ingest_token ?? null));
  }, [supabase, event.id]);

  async function save() {
    const { error } = await supabase.from("events").update({ room: room.trim() || null, status }).eq("id", event.id);
    setMsg(error ? error.message : "Gespeichert.");
    onSaved();
  }

  async function rotate() {
    if (!confirm("Neuen Token erzeugen? Der alte Reader-Token funktioniert danach nicht mehr.")) return;
    const fresh = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const { error } = await supabase.from("event_secrets").update({ ingest_token: fresh }).eq("event_id", event.id);
    if (error) setMsg(error.message);
    else setToken(fresh);
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="panel">
      <b>Event-Einstellungen (Admin)</b>
      <div className="grid2">
        <div><label>Raumcode des Readers</label><input value={room} onChange={(e) => setRoom(e.target.value)} style={{ width: "100%" }} /></div>
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as EventRow["status"])}>
            <option value="planned">Geplant</option>
            <option value="live">Live</option>
            <option value="finished">Beendet</option>
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" onClick={save}>Speichern</button>
        <button onClick={() => setShow((v) => !v)}>{show ? "Reader-Zugang verbergen" : "Reader-Zugang anzeigen"}</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      {show && (
        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            Trage diese beiden Zeilen in die <code>config.json</code> des Readers ein. Der Token ist geheim: Wer ihn kennt, kann Vorfälle in dieses Event einspeisen.
          </p>
          <pre>{`"site_url": "${origin}",\n"ingest_token": "${token ?? "(nicht lesbar)"}"`}</pre>
          <button className="danger" onClick={rotate}>Token neu erzeugen</button>
        </div>
      )}
    </div>
  );
}

function EventView() {
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { event, drivers, incidents, penalties, error, loaded, reload } = useEventData(params.id);
  const isStaff = profile?.role === "admin" || profile?.role === "steward";
  const canLive = isStaff || profile?.role === "broadcaster";
  const [tab, setTab] = useState<Tab>("incidents");
  const [selected, setSelected] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (profile && !initialised) {
      setTab(canLive ? "live" : "penalties");
      setInitialised(true);
    }
  }, [profile, canLive, initialised]);

  if (!loaded) return <div className="notice">Lade …</div>;
  if (!event) return <div className="notice">Event nicht gefunden. {error}</div>;

  const tabs: [Tab, string][] = [
    ...(canLive ? ([["live", "Live"]] as [Tab, string][]) : []),
    ["incidents", `Vorfälle${isStaff ? ` (${incidents.filter((i) => i.status !== "closed").length})` : ""}`],
    ["penalties", "Strafen"],
    ["drivers", "Fahrer"],
  ];

  return (
    <>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><b style={{ fontSize: 18 }}>{event.name}</b> <span className="muted">{event.track}</span></div>
          <span className={`badge ${event.status === "live" ? "open" : ""}`}>{{ planned: "Geplant", live: "Live", finished: "Beendet" }[event.status]}</span>
        </div>
      </div>
      {profile?.role === "admin" && <Settings event={event} onSaved={reload} />}
      {error && <div className="err">{error}</div>}
      <div className="tabs">
        {tabs.map(([key, label]) => (
          <div key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</div>
        ))}
      </div>
      {tab === "live" && canLive && (
        <LiveTab event={event} incidents={incidents} openIncident={(id) => { setSelected(id); setTab("incidents"); }} />
      )}
      {tab === "incidents" && (
        <IncidentsTab event={event} incidents={incidents} drivers={drivers} penalties={penalties} isStaff={isStaff} selectedId={selected} setSelectedId={setSelected} reload={reload} />
      )}
      {tab === "penalties" && (
        <PenaltiesTab event={event} penalties={penalties} drivers={drivers} isStaff={isStaff} myIngameName={profile?.ingame_name ?? null} reload={reload} />
      )}
      {tab === "drivers" && <DriversTab event={event} drivers={drivers} isStaff={isStaff} reload={reload} />}
    </>
  );
}

export default function EventPage() {
  return (
    <RequireAuth>
      <EventView />
    </RequireAuth>
  );
}
