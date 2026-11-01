"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/** Live-Umschalter fuer das Broadcast-Overlay: Knoepfe in "Controls" schalten Ansichten im laufenden OBS-Overlay. */
export const BC_VIEWS: [string, string][] = [
  ["tower", "Tower"], ["driver", "Fahrerkarte"], ["h2h", "Head to Head"], ["battle", "Onboard Battle"],
  ["telemetry", "Onboard Telemetry"], ["energy", "Virtual Energy"], ["replay", "Replay-Marke"],
];
const ev = "views";
type Msg = { views?: string[]; hello?: boolean };
const chan = (room: string) => `bcv-${room}`;

/** Sender (Website): sendet den Stand bei jeder Aenderung, auf "hello" des Overlays und alle 4 s. */
export function startController(supabase: SupabaseClient, room: string, get: () => string[]): { push: () => void; stop: () => void } {
  const ch: RealtimeChannel = supabase
    .channel(chan(room), { config: { broadcast: { self: false } } })
    .on("broadcast", { event: ev }, (m) => { if ((m.payload as Msg).hello) push(); })
    .subscribe((st) => { if (st === "SUBSCRIBED") push(); });
  const push = () => void ch.send({ type: "broadcast", event: ev, payload: { views: get() } satisfies Msg });
  const t = setInterval(push, 4000);
  return { push, stop: () => { clearInterval(t); void supabase.removeChannel(ch); } };
}

/** Empfaenger (Overlay): beim Link mit view=live. Letzter Stand bleibt im OBS-Browser gespeichert. */
export function useLiveViews(room: string, enabled: boolean, fallback: string[]): string[] {
  const key = `bcv-${room}`;
  const [views, setViews] = useState<string[]>(fallback);
  useEffect(() => {
    if (!enabled || !room) return;
    try { const s = localStorage.getItem(key); if (s) setViews(JSON.parse(s)); } catch {}
    const supabase = getSupabase();
    if (!supabase) return;
    const ch = supabase
      .channel(chan(room), { config: { broadcast: { self: false } } })
      .on("broadcast", { event: ev }, (m) => {
        const v = (m.payload as Msg).views;
        if (Array.isArray(v)) { const clean = v.filter((x) => typeof x === "string").slice(0, 12); setViews(clean); try { localStorage.setItem(key, JSON.stringify(clean)); } catch {} }
      })
      .subscribe((st) => { if (st === "SUBSCRIBED") void ch.send({ type: "broadcast", event: ev, payload: { hello: true } satisfies Msg }); });
    return () => { void supabase.removeChannel(ch); };
  }, [enabled, room, key]);
  return views;
}
