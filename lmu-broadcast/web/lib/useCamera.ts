"use client";

import { useState } from "react";
import { sendCommand } from "./commands";
import { useLive } from "./liveContext";
import { getSupabase } from "./supabase";
import type { Car } from "./types";

/** Kamera im Spiel steuern (über den Reader am Rennrechner). */
export function useCamera(eventId: string) {
  const { setWatching } = useLive();
  const [picked, setPicked] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function control(kind: "focus" | "live" | "next" | "prev", car?: Car) {
    const supabase = getSupabase();
    if (!supabase || busy) return;
    setBusy(true);
    setMsg(null);
    if (car) { setPicked(car.id); setWatching({ num: car.num, name: car.driver }); }
    const r = await sendCommand(supabase, eventId, kind === "focus" ? { kind: "focus", car: car?.num ?? null, driver: car?.driver ?? null } : { kind });
    if (kind === "live") { setPicked(null); setWatching(null); }
    setMsg(r);
    setBusy(false);
  }
  return { picked, msg, busy, control };
}
