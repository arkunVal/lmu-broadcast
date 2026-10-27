"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventDriver, EventRow, Incident, Penalty } from "./labels";
import { getSupabase } from "./supabase";

export function useEventData(eventId: string) {
  const supabase = getSupabase();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [drivers, setDrivers] = useState<EventDriver[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [ev, dr, inc, pen] = await Promise.all([
      supabase.from("events").select("id, name, track, room, starts_at, status").eq("id", eventId).maybeSingle(),
      supabase.from("event_drivers").select("*").eq("event_id", eventId).order("car_number", { nullsFirst: false }),
      supabase
        .from("incidents")
        .select("*, incident_drivers(*)")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
      supabase.from("penalties").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
    ]);
    const firstError = ev.error ?? dr.error ?? inc.error ?? pen.error;
    if (firstError) setError(firstError.message);
    else setError("");
    setEvent((ev.data as EventRow | null) ?? null);
    setDrivers((dr.data as EventDriver[]) ?? []);
    setIncidents((inc.data as Incident[]) ?? []);
    setPenalties((pen.data as Penalty[]) ?? []);
    setLoaded(true);
  }, [supabase, eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live-Updates: bei jeder Änderung an Vorfällen/Strafen kurz gebündelt neu laden
  useEffect(() => {
    if (!supabase) return;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 300);
    };
    const channel = supabase
      .channel(`event-db-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents", filter: `event_id=eq.${eventId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "penalties", filter: `event_id=eq.${eventId}` }, schedule)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, eventId, load]);

  return { event, drivers, incidents, penalties, error, loaded, reload: load };
}
