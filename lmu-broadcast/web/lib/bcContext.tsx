"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { useBcController, type BcNote } from "./bcSwitch";
import { useAuth } from "./auth";
import { KIND_EN, penEn } from "./penText";
import type { EventDriver, Incident, Penalty } from "./labels";

type Ctl = ReturnType<typeof useBcController>;
const noop = () => {};
const Ctx = createContext<Ctl>({ on: [], toggle: noop, replay: false, setReplay: noop, focus: null, setFocus: noop, transition: noop, notify: noop });
export const useBc = () => useContext(Ctx);

/** Ein Sender fuer das Broadcast-Overlay (Ansichten, Replay, Animationen, Meldungen) fuer die ganze Event-Seite. */
export function BcProvider({ room, children }: { room: string; children: React.ReactNode }) {
  const { profile } = useAuth();
  const can = profile?.role === "admin" || profile?.role === "steward" || profile?.role === "broadcaster";
  const ctl = useBcController(can ? room : "");
  return <Ctx.Provider value={ctl}>{children}</Ctx.Provider>;
}

const NFA = /^(no further action|rennunfall, keine strafe|kein vergehen)/i;
const SERVABLE = ["time", "drive_through", "stop_go"];

/** Beobachtet Strafen/Vorfaelle und meldet neue ans Broadcast-Overlay. Beim Laden vorhandenes wird nicht nochmal gezeigt. */
export function BcNotices({ ready, drivers, incidents, penalties }: { ready: boolean; drivers: EventDriver[]; incidents: Incident[]; penalties: Penalty[] }) {
  const { profile } = useAuth();
  const bc = useBc();
  const staff = profile?.role === "admin" || profile?.role === "steward";
  const seen = useRef<Set<string> | null>(null);
  const bcRef = useRef(bc);
  bcRef.current = bc;
  const team = (name: string | null, num: string | null) => drivers.find((d) => d.ingame_name.toLowerCase() === (name ?? "").toLowerCase() || (num != null && d.car_number === num))?.team ?? null;
  const who = (name: string | null, num: string | null) => `${num != null && num !== "" ? `#${num} ` : ""}${name ?? ""}${team(name, num) ? ` · ${team(name, num)}` : ""}`;

  useEffect(() => {
    if (!staff || !ready) return;
    const out: BcNote[] = [];
    const first = seen.current == null;
    const set = seen.current ?? (seen.current = new Set());
    const mark = (k: string, n: BcNote) => { if (set.has(k)) return; set.add(k); if (!first) out.push(n); };
    for (const p of penalties) {
      if (p.status === "revoked") continue;
      mark(`p:${p.id}`, { id: `p:${p.id}`, t: "pen", tag: SERVABLE.includes(p.kind) && !p.after_race ? "Penalty · to serve" : "Penalty applied", main: penEn(p.kind, p.amount, !!p.after_race), sub: p.reason || undefined, who: who(p.ingame_name, p.car_number), lap: p.lap });
    }
    for (const i of incidents) {
      const inv = i.incident_drivers.filter((d) => d.role === "involved").map((d) => who(d.ingame_name, d.car_number)).join(", ");
      if (i.status === "reviewing") mark(`r:${i.id}`, { id: `r:${i.id}`, t: "rev", tag: "Incident", main: KIND_EN[i.kind] ?? i.kind, sub: "Under review", who: inv, lap: i.lap });
      if (i.status === "closed" && NFA.test(String(i.decision ?? ""))) mark(`c:${i.id}`, { id: `c:${i.id}`, t: "ok", tag: "Decision", main: "No further action", who: inv, lap: i.lap });
    }
    out.forEach((n) => bcRef.current.notify(n));
  }, [staff, ready, incidents, penalties, drivers]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
