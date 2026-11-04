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
type Msg = { views?: string[]; replay?: boolean; focus?: string | null; hello?: boolean };
/** Meldung fuer das Broadcast-Overlay (Strafen, Pruefungen, Entscheidungen, Funk, Anhoerung). Texte sind schon englisch fertig. */
export type BcNote = { id: string; t: "pen" | "rev" | "ok" | "msg" | "iv" | "talk"; tag: string; main: string; sub?: string; who?: string; lap?: number | null; ms?: number; off?: boolean };
export type BcTr = { k: "replay" | "live"; id: number };
const chan = (room: string) => `bcv-${room}`;
const REPLAY_MS = 60000;   // Sicherheitsnetz: Replay-Blende endet nach 60 s, falls "Live" nie gedrueckt wird

/** Sender (Website): Ansichten + Replay-Blende. Sendet bei jeder Aenderung, auf "hello" des Overlays und alle 4 s. */
export function useBcController(room: string) {
  const [on, setOn] = useState<string[]>(["tower", "driver"]);
  const [replay, setReplayState] = useState(false);
  const [focus, setFocusState] = useState<string | null>(null);
  const st = useRef<{ on: string[]; until: number; focus: string | null }>({ on, until: 0, focus: null });
  const ch = useRef<RealtimeChannel | null>(null);
  const push = useCallback(() => {
    void ch.current?.send({ type: "broadcast", event: ev, payload: { views: st.current.on, replay: Date.now() < st.current.until, focus: st.current.focus } satisfies Msg });
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

  /** Auto im Overlay (Fahrerkarte usw.) festlegen; null = Auto aus den Spieldaten. */
  const setFocus = useCallback((num: string | null) => { st.current.focus = num; setFocusState(num); push(); }, [push]);

  /** Einmalige Ereignisse (nicht wiederholt): Uebergangs-Animation und Meldungen. */
  const transition = useCallback((k: BcTr["k"]) => { void ch.current?.send({ type: "broadcast", event: "tr", payload: { k, id: Date.now() } satisfies BcTr }); }, []);
  const notify = useCallback((n: BcNote) => { void ch.current?.send({ type: "broadcast", event: "note", payload: n }); }, []);

  return { on, toggle, replay, setReplay, focus, setFocus, transition, notify };
}

/** Empfaenger (Overlay): beim Link mit view=live. Letzter Stand bleibt im OBS-Browser gespeichert. */
export function useLiveViews(room: string, enabled: boolean, fallback: string[]): { views: string[]; replay: boolean; focus: string | null; tr: BcTr | null; notes: BcNote[] } {
  const key = `bcv-${room}`;
  const [views, setViews] = useState<string[]>(fallback);
  const [replay, setReplay] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [tr, setTr] = useState<BcTr | null>(null);
  const [notes, setNotes] = useState<BcNote[]>([]);
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
        if ("focus" in p) setFocus(typeof p.focus === "string" ? p.focus.slice(0, 8) : null);
      })
      .on("broadcast", { event: "tr" }, (m) => { const p = m.payload as BcTr; if (p && (p.k === "replay" || p.k === "live") && Math.abs(Date.now() - p.id) < 8000) setTr(p); })
      .on("broadcast", { event: "note" }, (m) => {
        const n = m.payload as BcNote;
        if (!n || typeof n.id !== "string" || typeof n.main !== "string") return;
        setNotes((cur) => {
          if (n.off) return cur.filter((x) => x.id !== n.id);
          const clean: BcNote = { id: n.id.slice(0, 60), t: n.t, tag: String(n.tag ?? "").slice(0, 60), main: n.main.slice(0, 160), sub: n.sub?.slice(0, 200), who: n.who?.slice(0, 160), lap: n.lap ?? null, ms: Math.min(Number(n.ms) || 20000, 40000) };
          return [...cur.filter((x) => x.id !== clean.id), clean].slice(-4);
        });
        if (!n.off) { const ms = Math.min(Number(n.ms) || 20000, 40000); setTimeout(() => setNotes((cur) => cur.filter((x) => x.id !== n.id)), ms); }
      })
      .subscribe((s) => { if (s === "SUBSCRIBED") void c.send({ type: "broadcast", event: ev, payload: { hello: true } satisfies Msg }); });
    return () => { void supabase.removeChannel(c); };
  }, [enabled, room, key]);
  return { views, replay, focus, tr, notes };
}
