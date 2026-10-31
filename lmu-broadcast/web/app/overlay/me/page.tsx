"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { OverlayVoice, type OverlayVoiceState } from "@/lib/voice";

type Who = { name: string; num: number | null; team: string | null };
type Pen = { id: string; name: string; num: number | null; team: string | null; lap: number | null; kind: string; amount: number | null; reason: string; createdAt: string; mine: boolean; persist: boolean; afterRace: boolean };
type Feed = {
  me: { uid: string; name: string; num: number | null; cls: string | null; team: string | null };
  event: { id: string; name: string };
  penalties: Pen[];
  reviews: { id: string; kind: string; lap: number | null; drivers: Who[]; createdAt: string }[];
  cleared: { id: string; lap: number | null; drivers: Who[]; closedAt: string }[];
};

const SHOW_MS = 20000; // Strafe, "Under review" und "No further action" stehen je 20 s im Bild

const KIND_EN: Record<string, string> = { contact: "Contact", offtrack: "Off track", track_limits: "Track limits", spin: "Spin", impact: "Impact", overtake: "Overtake", other: "Incident" };
function penEn(kind: string, amount: number | null, afterRace = false): string {
  const n = amount ?? 0;
  const t = (() => {
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
  })();
  return afterRace ? `${t} (added after the race)` : t;
}

function Who({ who }: { who: Who[] }) {
  if (who.length === 0) return <div className="oc-who"><b>Race Director</b></div>;
  return (
    <div className="oc-who">
      {who.map((w, i) => (
        <span key={i} className="oc-p">{w.num != null && <i>#{w.num}</i>}<b>{w.name}</b>{w.team && <em>{w.team}</em>}</span>
      ))}
    </div>
  );
}

function Card({ cls, tag, who, lap, children, timed, last }: { cls: string; tag: string; who: Who[]; lap?: number | null; children?: React.ReactNode; timed?: boolean; last?: React.ReactNode }) {
  return (
    <div className={`oc ${cls}`}>
      <div className="oc-top"><span className="oc-tag">{tag}</span>{lap !== undefined && <span className="oc-lap">Lap {lap ?? "–"}</span>}</div>
      <Who who={who} />
      {children}
      {last}
      {timed && <div className="oc-bar"><span style={{ animationDuration: `${SHOW_MS}ms` }} /></div>}
    </div>
  );
}

/**
 * Persoenliches Fahrer-Overlay (fuer SimHub "Web page view" oder jeden Browser).
 * /overlay/me?k=<Schluessel>&e=<Event-ID>   Optionen: scale=1, always=1 (zeigt "All clear"), demo=1 (Beispieldaten)
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
      const t = new Date().toISOString();
      setFeed({
        me: { uid: "demo", name: "Max Becker", num: 8, cls: "Hypercar", team: "Alpha" }, event: { id: "demo", name: "Demo" },
        penalties: [
          { id: "p1", name: "Max Becker", num: 8, team: "Alpha", lap: 7, kind: "time", amount: 10, reason: "Causing contact — significant", createdAt: t, mine: true, persist: true, afterRace: false },
          { id: "p2", name: "Sara Klein", num: 28, team: "Gamma", lap: 6, kind: "drive_through", amount: null, reason: "Track limits", createdAt: t, mine: false, persist: false, afterRace: false },
        ],
        reviews: [{ id: "i1", kind: "contact", lap: 9, drivers: [{ name: "Lena Vogt", num: 50, team: "Beta" }], createdAt: t }],
        cleared: [{ id: "c1", lap: 5, drivers: [{ name: "Tom Weber", num: 12, team: "Delta" }], closedAt: t }],
      });
      setVoice({ talking: true, toMe: true, onlyMe: true, message: "Box this lap please" });
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
        const mark = (key: string) => { if (!seen.current.has(key)) seen.current.set(key, first.current ? 0 : Date.now()); };
        f.penalties.forEach((p) => mark(`p:${p.id}`));
        f.reviews.forEach((r2) => mark(`r:${r2.id}`));
        f.cleared.forEach((c) => mark(`c:${c.id}`));
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

  if (error && !feed) return <div className="dov"><div className="oc oc-rad"><div className="oc-top"><span className="oc-tag">Overlay</span></div><div className="oc-main">{error}</div></div></div>;
  if (!feed) return null;

  const live = (key: string) => { const t = seen.current.get(key) ?? 0; return t > 0 && now - t < SHOW_MS; };
  const penShown = feed.penalties.filter((p) => demo || p.persist || live(`p:${p.id}`));
  const revShown = feed.reviews.filter((r) => demo || live(`r:${r.id}`));
  const clrShown = feed.cleared.filter((c) => demo || live(`c:${c.id}`));
  const empty = !voice.talking && !voice.message && penShown.length + revShown.length + clrShown.length === 0;

  return (
    <div className="dov" style={{ zoom: scale }} data-testid="dov">
      {voice.talking && (
        <div className="oc oc-radio">
          <div className="oc-top"><span className="oc-tag"><span className="oc-dot" />Race Control · Radio</span></div>
          <div className="oc-main">{voice.onlyMe ? "Speaking to you only" : "Speaking"}</div>
        </div>
      )}
      {voice.message && (
        <div className="oc oc-radio">
          <div className="oc-top"><span className="oc-tag">Race Control · Message</span></div>
          <div className="oc-main">{voice.message}</div>
        </div>
      )}
      {penShown.map((p) => {
        const timed = !p.persist;
        return (
          <Card key={p.id} cls="oc-pen" tag={p.persist ? "Penalty · to serve" : "Penalty applied"} who={[{ name: p.name, num: p.num, team: p.team }]} lap={p.lap} timed={timed}>
            <div className="oc-main">{penEn(p.kind, p.amount, p.afterRace)}</div>
            <div className="oc-reason"><span>Reason</span>{p.reason || "–"}</div>
          </Card>
        );
      })}
      {revShown.map((r) => (
        <Card key={r.id} cls="oc-rev" tag="Incident" who={r.drivers} lap={r.lap} timed>
          <div className="oc-main">{KIND_EN[r.kind] ?? r.kind}</div>
          <div className="oc-status">Under review</div>
        </Card>
      ))}
      {clrShown.map((c) => (
        <Card key={c.id} cls="oc-ok" tag="Decision" who={c.drivers} lap={c.lap} timed>
          <div className="oc-status">No further action</div>
        </Card>
      ))}
      {empty && q.get("always") === "1" && <div className="oc oc-radio"><div className="oc-top"><span className="oc-tag">Race Control</span></div><div className="oc-main">All clear · #{feed.me.num ?? ""} {feed.me.name}</div></div>}
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
