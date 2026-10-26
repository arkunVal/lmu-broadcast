"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveData } from "./useLiveData";

/** Liest Raumcode und Optionen aus der URL, z. B. ?room=abc&max=12 */
export function useOverlayData() {
  const [params, setParams] = useState<URLSearchParams | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const room = params?.get("room") ?? "";
  const live = useLiveData(room);
  const debug = params?.get("debug") === "1";
  const ageMs = live.receivedAt ? now - live.receivedAt : null;
  const fresh = ageMs !== null && ageMs < 5000;

  const snapshot = useMemo(
    () => (live.snapshot && live.snapshot.status === "live" && (fresh || debug) ? live.snapshot : null),
    [live.snapshot, fresh, debug],
  );

  return { params, room, snapshot, connection: live.connection, ageMs, debug };
}

export function num(params: URLSearchParams | null, key: string, fallback: number): number {
  const v = Number(params?.get(key));
  return params?.get(key) != null && isFinite(v) ? v : fallback;
}
