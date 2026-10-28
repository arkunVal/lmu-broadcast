import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cleanHints, describe } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Reader schickt hierher automatisch erkannte Vorfall-Hinweise.
 * Header: x-ingest-token = geheimer Token des Events (Admin sieht ihn in den Event-Einstellungen).
 * Der Service-Key bleibt serverseitig (Vercel-Umgebungsvariable SUPABASE_SERVICE_ROLE_KEY).
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY fehlt)" }, { status: 500 });
  }

  const token = req.headers.get("x-ingest-token")?.trim() ?? "";
  if (token.length < 20) return NextResponse.json({ error: "Token fehlt oder ungueltig" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Kein gueltiges JSON" }, { status: 400 });
  }
  const { hints, error } = cleanHints(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: secret, error: secretError } = await admin
    .from("event_secrets")
    .select("event_id")
    .eq("ingest_token", token)
    .maybeSingle();
  if (secretError) return NextResponse.json({ error: "Datenbankfehler" }, { status: 500 });
  if (!secret) return NextResponse.json({ error: "Token unbekannt" }, { status: 401 });
  if (hints.length === 0) return NextResponse.json({ inserted: 0, duplicates: 0 });

  const eventId = secret.event_id as string;
  const rows = hints.map((h) => ({
    event_id: eventId,
    source: "auto",
    hint_key: h.key,
    kind: h.kind,
    confidence: h.confidence,
    status: "open",
    session_type: h.sessionType,
    session_time: h.sessionTime,
    lap: h.lap,
    lap_dist: h.lapDist,
    description: describe(h),
    details: h.details,
  }));

  // Doppelte (gleicher hint_key im Event) werden uebersprungen und nicht zurueckgegeben
  const { data: inserted, error: insertError } = await admin
    .from("incidents")
    .upsert(rows, { onConflict: "event_id,hint_key", ignoreDuplicates: true })
    .select("id, hint_key");
  if (insertError) return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });

  const idByKey = new Map((inserted ?? []).map((r) => [r.hint_key as string, r.id as string]));
  const driverRows = hints.flatMap((h) => {
    const id = idByKey.get(h.key);
    if (!id) return [];
    return h.drivers.map((d) => ({ incident_id: id, ingame_name: d.name, car_number: d.num, role: d.role }));
  });
  if (driverRows.length) {
    const { error: driverError } = await admin.from("incident_drivers").insert(driverRows);
    if (driverError) return NextResponse.json({ error: "Beteiligte konnten nicht gespeichert werden" }, { status: 500 });
  }

  return NextResponse.json({ inserted: idByKey.size, duplicates: hints.length - idByKey.size });
}
