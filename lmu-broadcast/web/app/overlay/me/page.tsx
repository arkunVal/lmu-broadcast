"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PENALTY_KINDS, INCIDENT_KINDS, penaltyText } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";
import { OverlayVoice, type OverlayVoiceState } from "@/lib/voice";

type Feed = {
  me: { uid: string; name: string; num: number | null; cls: string | null; team: string | null };
  event: { id: string; name: string };
  penalties: { id: string; kind: string; amount: number | null; reason: string; createdAt: string }[];
  incidents: { id: string; kind: string; lap: number | null; createdAt: string }[];
};

const NEW_MS = 25000; // so lange blinkt eine neue Strafe gross

/**
 * Persoenliches Fahrer-Overlay (fuer SimHub "Web page view" oder jeden Browser).
 * /overlay/me?k=<Schluessel>&e=<Event-ID>   Optionen: scale=1, bg=1 (dunkler Hintergrund), demo=1 (Beispieldaten)
 */
function Inner() {
  const q = useSearchParams();
  const k = q.get("k") ?? "";
  const e = q.get("e") ?? "";
  const scale = Number(q.get("scale")) || 1;
  const demo = q.get("demo") === "1";
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState<OverlayVoiceState>({ talking: false, toMe: false, onlyMe: false, message: null });
  const [now, setNow] = useState(Date.now());
  const seen = useRef<Map<string, number>>(new Map());
  const first = useRef(true);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (demo) {
      setFeed({
        me: { uid: "demo", name: "Max Becker", num: 8, cls: "Hypercar", team: "Alpha" }, event: { id: "demo", name: "Demo" },
        penalties: [{ id: "p1", kind: "time", amount: 5, reason: "Kontakt in Kurve 3", createdAt: new Date().toISOString() }],
        incidents: [{ id: "i1", kind: "contact", lap: 7, createdAt: new Date().toISOString() }],
      });
      setVoice({ talking: true, toMe: true, onlyMe: true, message: "Boxen bitte in Runde 12" });
      return;
    }
    if (!k || !e) { setError("Link unvollständig. Den Link im Event unter „Session“ kopieren."); return; }
    let stop = false;
    async function load() {
      try {
        const r = await fetch(`/api/driver-feed?k=${encodeURIComponent(k)}&e=${encodeURIComponent(e)}`, { cache: "no-store" });
        const j = await r.json();
        if (stop) return;
        if (!r.ok) { setError(j.error ?? `Fehler ${r.status}`); return; }
        setError("");
        const f = j as Feed;
        for (const p of f.penalties) if (!seen.current.has(p.id)) seen.current.set(p.id, first.current ? 0 : Date.now());
        first.current = false;
        setFeed(f);
      } catch {
        if (!stop) setError("Keine Verbindung");
      }
    }
    void load();
    const t = setInterval(load, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [k, e, demo]);

  useEffect(() => {
    if (demo || !feed) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const v = new OverlayVoice(supabase, feed.event.id, { uid: feed.me.uid, name: feed.me.name, role: "overlay", team: feed.me.team, cls: feed.me.cls, num: feed.me.num }, setVoice);
    return () => v.stop();
  }, [feed?.event.id, feed?.me.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !feed) return <div className="dov"><div className="dov-card dov-bad">{error}</div></div>;
  if (!feed) return null;

  const fresh = feed.penalties.filter((p) => demo || now - (seen.current.get(p.id) ?? 0) < NEW_MS && (seen.current.get(p.id) ?? 0) > 0);
  const old = feed.penalties.filter((p) => !fresh.includes(p));
  const empty = !voice.talking && !voice.message && feed.penalties.length === 0 && feed.incidents.length === 0;

  return (
    <div className="dov" style={{ zoom: scale }} data-testid="dov">
      {voice.talking && (
        <div className="dov-card dov-voice">
          <span className="dov-dot" />
          <div><b>RENNLEITUNG SPRICHT</b><small>{voice.onlyMe ? "nur zu dir" : "an dich und andere"}</small></div>
        </div>
      )}
      {voice.message && <div className="dov-card dov-msg"><small>NACHRICHT DER RENNLEITUNG</small><b>{voice.message}</b></div>}
      {fresh.map((p) => (
        <div key={p.id} className="dov-card dov-pen dov-new">
          <small>NEUE STRAFE</small>
          <b>{penaltyText(p.kind, p.amount)}</b>
          {p.reason && <span>{p.reason}</span>}
        </div>
      ))}
      {feed.incidents.map((i) => (
        <div key={i.id} className="dov-card dov-inc">
          <small>VORFALL IN BEARBEITUNG</small>
          <b>{INCIDENT_KINDS[i.kind] ?? i.kind}{i.lap != null ? ` · Runde ${i.lap}` : ""}</b>
          <span>Du bist beteiligt. Die Rennleitung prüft.</span>
        </div>
      ))}
      {old.length > 0 && (
        <div className="dov-card dov-list">
          <small>OFFENE STRAFEN</small>
          {old.map((p) => <div key={p.id}><b>{penaltyText(p.kind, p.amount)}</b>{p.reason ? <span> · {p.reason}</span> : null}</div>)}
        </div>
      )}
      {empty && q.get("always") === "1" && <div className="dov-card dov-ok">Alles ruhig · #{feed.me.num ?? ""} {feed.me.name}</div>}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
