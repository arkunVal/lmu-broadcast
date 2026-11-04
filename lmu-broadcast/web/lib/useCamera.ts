"use client";

import { useState } from "react";
import { sendCommand } from "./commands";
import { useLive } from "./liveContext";
import { getSupabase } from "./supabase";
import type { Car } from "./types";

/** Kamera im Spiel steuern (ueber den Reader am Rennrechner, nur lokale Spiel-Schnittstelle). */
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
  /** Nur Auswahl auf der Website (z. B. fuer die Tabelle), ohne das Spiel anzufassen. */
  function pick(car: Car | null) {
    setPicked(car ? car.id : null);
    setWatching(car ? { num: car.num, name: car.driver } : null);
  }
  return { picked, msg, busy, control, pick };
}
