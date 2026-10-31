"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { OverlayVoice, type OverlayVoiceState } from "@/lib/voice";

type Who = { name: string; num: number | null; team: string | null };
type Pen = { id: string; name: string; num: number | null; team: string | null; lap: number | null; kind: string; amount: number | null; reason: string; createdAt: string; mine: boolean };
type Feed = {
  me: { uid: string; name: string; num: number | null; cls: string | null; team: string | null };
  event: { id: string; name: string };
  penalties: Pen[];
  reviews: { id: string; kind: string; lap: number | null; drivers: Who[]; createdAt: string }[];
  cleared: { id: string; lap: number | null; drivers: Who[]; closedAt: string }[];
};

const KIND_EN: Record<string, string> = { contact: "Contact", offtrack: "Off track", track_limits: "Track limits", spin: "Spin", impact: "Impact", overtake: "Overtake", other: "Incident" };
function penEn(kind: string, amount: number | null): string {
  const n = amount ?? 0;
  switch (kind) {
    case "warning": return "Warning";
    case "time": return `${n} second time penalty`;
    case "drive_through": return "Drive-through penalty";
    case "stop_go": return `${n} second stop-and-go`;
    case "grid": return `${n} place grid penalty`;
    case "dq": return "Disqualification";
    case "race_ban": return "Race ban";
    case "quali_ban": return "Qualifying ban";
    default: return kind;
  }
}

const NEW_MS = 25000; // so lange steht eine neue Strafe gross im Bild

function Head({ who }: { who: Who[] }) {
  const t = who.map((w) => `${w.num != null ? `#${w.num} ` : ""}${w.name}${w.team ? ` · ${w.team}` : ""}`).join("  /  ");
  return <div className="pc-h">{t || "RACE DIRECTOR"}</div>;
}

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
        penalties: [{ id: "p1", name: "Max Becker", num: 8, team: "Alpha", lap: 7, kind: "time", amount: 5, reason: "Kontakt in Kurve 3", createdAt: new Date().toISOString(), mine: true }],
        reviews: [{ id: "i1", kind: "contact", lap: 9, drivers: [{ name: "Lena Vogt", num: 50, team: "Beta" }], createdAt: new Date().toISOString() }],
        cleared: [{ id: "c1", lap: 5, drivers: [{ name: "Sara Klein", num: 28, team: "Gamma" }], closedAt: new Date().toISOString() }],
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

  const fresh = feed.penalties.filter((p) => demo || (now - (seen.current.get(p.id) ?? 0) < NEW_MS && (seen.current.get(p.id) ?? 0) > 0));
  const mineOld = feed.penalties.filter((p) => p.mine && !fresh.includes(p));
  const empty = !voice.talking && !voice.message && fresh.length + feed.reviews.length + feed.cleared.length + mineOld.length === 0;

  return (
    <div className="dov" style={{ zoom: scale }} data-testid="dov">
      {voice.talking && (
        <div className="pc pc-voice">
          <div className="pc-h">RACE DIRECTOR</div>
          <div><span className="dov-dot" />{voice.onlyMe ? "Speaking to you only" : "Speaking"}</div>
        </div>
      )}
      {voice.message && (
        <div className="pc">
          <div className="pc-h">RACE DIRECTOR</div>
          <div>{voice.message}</div>
        </div>
      )}
      {fresh.map((p) => (
        <div key={p.id} className="pc">
          <Head who={[{ name: p.name, num: p.num, team: p.team }]} />
          <div>Lap: <b>{p.lap ?? "–"}</b></div>
          <div>Penalty: <b>{penEn(p.kind, p.amount)}</b></div>
          <div>Reason: <b>{p.reason || "–"}</b></div>
        </div>
      ))}
      {feed.reviews.map((i) => (
        <div key={i.id} className="pc">
          <Head who={i.drivers} />
          <div>Lap: <b>{i.lap ?? "–"}</b></div>
          <div>Incident: <b>{KIND_EN[i.kind] ?? i.kind}</b></div>
          <div className="pc-status"><b>Under review</b></div>
        </div>
      ))}
      {feed.cleared.map((i) => (
        <div key={i.id} className="pc">
          <Head who={i.drivers} />
          <div>Lap: <b>{i.lap ?? "–"}</b></div>
          <div className="pc-status"><b>No further action</b></div>
        </div>
      ))}
      {mineOld.length > 0 && (
        <div className="pc">
          <div className="pc-h">YOUR OPEN PENALTIES</div>
          {mineOld.map((p) => <div key={p.id}><b>{penEn(p.kind, p.amount)}</b>{p.reason ? ` — ${p.reason}` : ""}</div>)}
        </div>
      )}
      {empty && q.get("always") === "1" && <div className="pc"><div className="pc-h">RACE DIRECTOR</div><div>All clear · #{feed.me.num ?? ""} {feed.me.name}</div></div>}
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
