"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/** Live-Umschalter fuer das Broadcast-Overlay: Knoepfe auf der Website schalten Ansichten im laufenden OBS-Overlay. */
export const BC_VIEWS: [string, string][] = [
  ["tower", "Tower"], ["driver", "Fahrerkarte"], ["h2h", "Head to Head"], ["battle", "Onboard Battle"],
  ["telemetry", "Onboard Telemetry"], ["energy", "Virtual Energy"],
];
const ev = "views";
type Msg = { views?: string[]; replay?: boolean; hello?: boolean };
const chan = (room: string) => `bcv-${room}`;
const REPLAY_MS = 60000;   // Sicherheitsnetz: Replay-Blende endet nach 60 s, falls "Live" nie gedrueckt wird

/** Sender (Website): Ansichten + Replay-Blende. Sendet bei jeder Aenderung, auf "hello" des Overlays und alle 4 s. */
export function useBcController(room: string) {
  const [on, setOn] = useState<string[]>(["tower", "driver"]);
  const [replay, setReplayState] = useState(false);
  const st = useRef({ on, until: 0 });
  const ch = useRef<RealtimeChannel | null>(null);
  const push = useCallback(() => {
    void ch.current?.send({ type: "broadcast", event: ev, payload: { views: st.current.on, replay: Date.now() < st.current.until } satisfies Msg });
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !room) return;
    try { const u = Number(localStorage.getItem(`bcv-rp-${room}`)); if (u > Date.now()) { st.current.until = u; setReplayState(true); } } catch {}
    try { const s = localStorage.getItem(`bcv-ctl-${room}`); if (s) { const v = JSON.parse(s); if (Array.isArray(v)) { st.current.on = v; setOn(v); } } } catch {}
    const c = supabase
      .channel(chan(room), { config: { broadcast: { self: false } } })
      .on("broadcast", { event: ev }, (m) => { if ((m.payload as Msg).hello) push(); })
      .subscribe((s) => { if (s === "SUBSCRIBED") push(); });
    ch.current = c;
    const t = setInterval(() => { if (st.current.until && Date.now() >= st.current.until) { st.current.until = 0; setReplayState(false); } push(); }, 4000);
    return () => { clearInterval(t); ch.current = null; void supabase.removeChannel(c); };
  }, [room, push]);

  const toggle = useCallback((k: string) => {
    const next = st.current.on.includes(k) ? st.current.on.filter((x) => x !== k) : [...st.current.on, k];
    st.current.on = next;
    setOn(next);
    try { localStorage.setItem(`bcv-ctl-${room}`, JSON.stringify(next)); } catch {}
    push();
  }, [room, push]);

  const setReplay = useCallback((v: boolean) => {
    st.current.until = v ? Date.now() + REPLAY_MS : 0;
    try { localStorage.setItem(`bcv-rp-${room}`, String(st.current.until)); } catch {}
    setReplayState(v);
    push();
  }, [room, push]);

  return { on, toggle, replay, setReplay };
}

/** Empfaenger (Overlay): beim Link mit view=live. Letzter Stand bleibt im OBS-Browser gespeichert. */
export function useLiveViews(room: string, enabled: boolean, fallback: string[]): { views: string[]; replay: boolean } {
  const key = `bcv-${room}`;
  const [views, setViews] = useState<string[]>(fallback);
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    if (!enabled || !room) return;
    try { const s = localStorage.getItem(key); if (s) setViews(JSON.parse(s)); } catch {}
    const supabase = getSupabase();
    if (!supabase) return;
    const c = supabase
      .channel(chan(room), { config: { broadcast: { self: false } } })
      .on("broadcast", { event: ev }, (m) => {
        const p = m.payload as Msg;
        if (Array.isArray(p.views)) { const clean = p.views.filter((x) => typeof x === "string").slice(0, 12); setViews(clean); try { localStorage.setItem(key, JSON.stringify(clean)); } catch {} }
        if (typeof p.replay === "boolean") setReplay(p.replay);
      })
      .subscribe((s) => { if (s === "SUBSCRIBED") void c.send({ type: "broadcast", event: ev, payload: { hello: true } satisfies Msg }); });
    return () => { void supabase.removeChannel(c); };
  }, [enabled, room, key]);
  return { views, replay };
}
