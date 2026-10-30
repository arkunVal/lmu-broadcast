"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Snapshot } from "./types";
import { useLiveData, type ConnectionState } from "./useLiveData";

export type Watching = { num: number | null; name: string } | null;

type LiveCtx = {
  snapshot: Snapshot | null;
  connection: ConnectionState;
  receivedAt: number | null;
  packets: number;
  age: number | null;
  live: boolean;
  watching: Watching;
  setWatching: (w: Watching) => void;
  leaderLaps: number | null;
};

const Ctx = createContext<LiveCtx | null>(null);

/** Eine einzige Live-Verbindung fuer die ganze Event-Seite (Kopfleiste, Live-Reiter, Strafformular). */
export function LiveProvider({ room, children }: { room: string; children: React.ReactNode }) {
  const { snapshot, connection, receivedAt, packets } = useLiveData(room);
  const [now, setNow] = useState(() => Date.now());
  const [watching, setWatching] = useState<Watching>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const age = receivedAt ? Math.max(0, (now - receivedAt) / 1000) : null;
  const live = snapshot?.status === "live" && age !== null && age < 5;
  const leaderLaps = useMemo(() => {
    if (!snapshot || !live) return null;
    const laps = snapshot.cars.map((c) => c.laps ?? 0);
    return laps.length ? Math.max(...laps) : null;
  }, [snapshot, live]);
  const value = useMemo(
    () => ({ snapshot, connection, receivedAt, packets, age, live, watching, setWatching, leaderLaps }),
    [snapshot, connection, receivedAt, packets, age, live, watching, leaderLaps],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLive(): LiveCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLive ausserhalb von LiveProvider");
  return v;
}

/** Flaggenstatus fuer die Kopfleiste und die Live-Seite. */
export function flagInfo(s: Snapshot["session"] | undefined): { cls: string; text: string } {
  if (!s) return { cls: "", text: "–" };
  if (s.phase === 7) return { cls: "red", text: "SESSION GESTOPPT" };
  if (s.phase === 6) return { cls: "yellow", text: "FULL COURSE YELLOW" };
  if (s.sectorFlags.some(Boolean)) return { cls: "yellow", text: "GELB" };
  return { cls: "", text: "GRÜNE FLAGGE" };
}
