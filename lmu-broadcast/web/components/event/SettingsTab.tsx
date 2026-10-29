"use client";

import { useEffect, useState } from "react";
import DeleteEvent from "./DeleteEvent";
import { useRouter } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import type { EventRow } from "@/lib/labels";
import { encodeReaderKey } from "@/lib/readerKey";
import { getSupabase } from "@/lib/supabase";
import { trackSlug } from "@/lib/tracks";

const OTHER = "__other__";
type TrackOpt = { slug: string; name: string };

export default function SettingsTab({ event, onSaved }: { event: EventRow; onSaved: () => void }) {
  const router = useRouter();
  const supabase = getSupabase()!;
  const [status, setStatus] = useState(event.status);
  const [tracks, setTracks] = useState<TrackOpt[]>([]);
  const known = (slug: string | null) => !slug || tracks.some((t) => t.slug === slug);
  const [track, setTrack] = useState(event.track_slug ?? "");
  const [other, setOther] = useState("");
  const [replayOffset, setReplayOffset] = useState(String(event.replay_offset ?? 0));
  const [classes, setClasses] = useState((event.classes ?? []).join(", "));
  const [teamEvent, setTeamEvent] = useState(!!event.is_team_event);
  const [token, setToken] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("tracks").select("slug, name").order("name").then(({ data }) => setTracks((data as TrackOpt[]) ?? []));
    supabase.from("event_secrets").select("ingest_token").eq("event_id", event.id).maybeSingle()
      .then(({ data }) => setToken((data as { ingest_token: string } | null)?.ingest_token ?? null));
  }, [supabase, event.id]);

  // Strecke, die noch nicht aufgezeichnet ist, wird als "Andere" vorbelegt
  useEffect(() => {
    if (tracks.length && event.track_slug && !known(event.track_slug)) {
      setTrack(OTHER);
      setOther(event.track ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  async function save() {
    setErr("");
    setMsg("");
    let name: string | null = null;
    let slug: string | null = null;
    if (track === OTHER) {
      name = other.trim() || null;
      slug = name ? trackSlug(name) : null;
    } else if (track) {
      const t = tracks.find((x) => x.slug === track);
      name = t?.name ?? event.track;
      slug = t?.slug ?? track;
    }
    const { error } = await supabase.from("events").update({ status, track: name, track_slug: slug, replay_offset: Math.round(Number(replayOffset) || 0), classes: classes.split(/[,;\n]/).map((c) => c.trim()).filter((c, i, a) => c && a.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i), is_team_event: teamEvent }).eq("id", event.id);
    if (error) setErr(error.message);
    else setMsg("Gespeichert.");
    onSaved();
  }

  async function newCode() {
    if (!confirm("Neuen Event-Code erzeugen? Der alte Code funktioniert danach nicht mehr. Fahrer, die schon beigetreten sind, bleiben dabei.")) return;
    const { error } = await supabase.rpc("regenerate_event_code", { p_event: event.id });
    if (error) setErr(error.message);
    onSaved();
  }

  async function rotate() {
    if (!confirm("Neuen Reader-Key erzeugen? Der alte Reader-Key funktioniert danach nicht mehr, der Reader braucht dann den neuen.")) return;
    const fresh = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const { error } = await supabase.from("event_secrets").update({ ingest_token: fresh }).eq("event_id", event.id);
    if (error) setErr(error.message);
    else setToken(fresh);
  }

  const readerKey =
    token && typeof window !== "undefined"
      ? encodeReaderKey({
          supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
          anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          room: event.room,
          site_url: window.location.origin,
          ingest_token: token,
        })
      : "";

  return (
    <div className="scrollarea">
     <div className="cardgrid c3">
      <div className="panel wide">
        <h3>Event</h3>
        <div className="grid2">
          <div>
            <label>Strecke</label>
            <select value={track} onChange={(e) => setTrack(e.target.value)}>
              <option value="">Noch offen</option>
              {tracks.length > 0 && <optgroup label="Schon aufgezeichnet">{tracks.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</optgroup>}
              <option value={OTHER}>Andere Strecke …</option>
            </select>
          </div>
          {track === OTHER && <div><label>Name der Strecke</label><input value={other} onChange={(e) => setOther(e.target.value)} /></div>}
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as EventRow["status"])}>
              <option value="planned">Geplant</option>
              <option value="live">Live</option>
              <option value="finished">Beendet</option>
            </select>
          </div>
        </div>
        <label>Klassen (Auswahl bei der Anmeldung, mit Komma getrennt)</label>
        <input value={classes} onChange={(e) => setClasses(e.target.value)} placeholder="Hypercar, LMP2, LMGT3" style={{ width: "100%" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0, fontSize: 14, color: "var(--text)", cursor: "pointer" }}>
          <input type="checkbox" checked={teamEvent} onChange={(e) => setTeamEvent(e.target.checked)} style={{ width: 18, height: 18 }} />
          Team-Event
        </label>
        <div style={{ marginTop: 4, maxWidth: 320 }}>
          <label>Replay-Uhr Versatz (Sekunden, normal 0)</label>
          <input type="number" value={replayOffset} onChange={(e) => setReplayOffset(e.target.value)} />
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
          Der Reader liest bei jedem Vorfall die Session-Uhr des Spiels. Im Replay von Le Mans Ultimate springst du diese Zeit an (8 Sekunden vorher). Läuft die Replay-Uhr bei dir anders, trägst du hier einmal den Unterschied in Sekunden ein.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={save}>Speichern</button>
          {msg && <span className="okmsg" style={{ margin: 0 }}>{msg}</span>}
        </div>
        {err && <div className="err">{err}</div>}
      </div>

      <div className="panel">
        <h3>Event-Code für Fahrer</h3>
        <p className="muted" style={{ margin: "2px 0 10px" }}>Mit diesem Code treten Fahrer dem Event bei.</p>
        <div className="row"><span className="codebox">{event.code}</span><CopyButton text={event.code} /><button onClick={newCode}>Neuen Code erzeugen</button></div>
      </div>

      <div className="panel">
        <h3>Reader-Key</h3>
        <p className="muted" style={{ margin: "2px 0 10px" }}>
          Dieser eine Key enthält alle Einstellungen für den Reader. Beim ersten Start des Readers einfügen, fertig. Er ist geheim: Wer ihn kennt, kann Daten und Vorfälle in dieses Event einspeisen.
        </p>
        <div className="row">
          <button onClick={() => setShowKey((v) => !v)}>{showKey ? "Verbergen" : "Anzeigen"}</button>
          {readerKey && <CopyButton text={readerKey} label="Key kopieren" />}
          <button className="danger" onClick={rotate}>Neuen Key erzeugen</button>
        </div>
        {showKey && <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{readerKey || "(nicht lesbar)"}</pre>}
      </div>

      <div className="panel">
        <h3>Event löschen</h3>
        <p className="muted" style={{ margin: "2px 0 10px" }}>Entfernt das Event mit allen Vorfällen, Strafen, Fahrern und dem Reader-Key. Das kann nicht rückgängig gemacht werden.</p>
        <DeleteEvent id={event.id} name={event.name} onDeleted={() => router.replace("/events")} />
      </div>
     </div>
    </div>
  );
}
