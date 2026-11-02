"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtTime } from "./format";
import { INCIDENT_KINDS, type Incident } from "./labels";
import { pickFocus } from "./focus";
import type { Snapshot } from "./types";

export type FeedKind = "IMP" | "CON" | "SPN" | "OFF" | "OVT" | "PIT" | "FL";
export const FEED_KINDS: FeedKind[] = ["CON", "IMP", "SPN", "OFF", "OVT", "PIT", "FL"];
export type FeedItem = { id: string; kind: FeedKind; t: number | null; num: string | null; name: string; text: string };

const KIND: Record<string, FeedKind> = { contact: "CON", impact: "IMP", spin: "SPN", offtrack: "OFF", track_limits: "OFF", overtake: "OVT" };

/**
 * Event-Feed: Hinweise/Vorfaelle aus der Datenbank plus Boxenstopps und schnellste Runden, die hier live aus den Daten
 * erkannt werden (ab dem Moment, in dem die Seite offen ist).
 */
export function useEventFeed(snapshot: Snapshot | null, live: boolean, incidents: Incident[]): FeedItem[] {
  const [derived, setDerived] = useState<FeedItem[]>([]);
  const prev = useRef<Map<number, { pit: boolean; best: number | null }>>(new Map());
  const classBest = useRef<Map<string, number>>(new Map());
  const n = useRef(0);

  useEffect(() => {
    if (!snapshot || !live) return;
    const add: FeedItem[] = [];
    const t = snapshot.session.time;
    const first = prev.current.size === 0;
    for (const c of snapshot.cars) {
      const p = prev.current.get(c.id);
      if (p && !first) {
        if (!p.pit && c.inPits) add.push({ id: `l${n.current++}`, kind: "PIT", t, num: c.num, name: c.driver, text: "Pit in" });
        if (p.pit && !c.inPits) add.push({ id: `l${n.current++}`, kind: "PIT", t, num: c.num, name: c.driver, text: "Pit out" });
      }
      if (c.bestLap != null && c.bestLap > 20) {
        const b = classBest.current.get(c.cls);
        if (b == null || c.bestLap < b - 0.0005) {
          classBest.current.set(c.cls, c.bestLap);
          if (b != null && !first) add.push({ id: `l${n.current++}`, kind: "FL", t, num: c.num, name: c.driver, text: `Fastest lap ${fmtTime(c.bestLap)}` });
        }
      }
      prev.current.set(c.id, { pit: c.inPits, best: c.bestLap });
    }
    if (add.length) setDerived((d) => [...add.reverse(), ...d].slice(0, 80));
  }, [snapshot, live]);

  return useMemo(() => {
    const fromDb: FeedItem[] = incidents
      .filter((i) => KIND[i.kind] && i.session_time != null)
      .map((i) => {
        const f = pickFocus(i);
        const others = (i.incident_drivers ?? []).filter((d) => d.ingame_name !== f?.name).map((d) => `#${d.car_number ?? "?"}`).join(" ");
        return { id: `i${i.id}`, kind: KIND[i.kind], t: i.session_time, num: f?.num ?? null, name: f?.name ?? "", text: `${INCIDENT_KINDS[i.kind] ?? i.kind}${others ? ` · ${others}` : ""}` };
      });
    return [...fromDb, ...derived].sort((a, b) => (b.t ?? 0) - (a.t ?? 0)).slice(0, 120);
  }, [incidents, derived]);
}
