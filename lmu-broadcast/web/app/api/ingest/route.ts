import { NextResponse } from "next/server";
import { cleanHints, describe } from "@/lib/ingest";
import { admin, err, eventFromToken, limited, NOT_CONFIGURED, ok, readJson } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Der Reader schickt hierher automatisch erkannte Vorfall-Hinweise. Header: x-ingest-token (Event-Einstellungen). */
export async function POST(req: Request) {
  const db = admin();
  if (!db) return NOT_CONFIGURED();
  if (limited(req, "ingest", 120)) return err("Zu viele Anfragen", 429);
  const auth = await eventFromToken(req, db);
  if ("res" in auth) return auth.res;
  const body = await readJson(req);
  if (!body) return err("Kein gueltiges JSON", 400);
  const { hints, error } = cleanHints(body);
  if (error) return err(error, 400);
  if (hints.length === 0) return ok({ inserted: 0, duplicates: 0 });

  const rows = hints.map((h) => ({
    event_id: auth.eventId, source: "auto", hint_key: h.key, kind: h.kind, confidence: h.confidence, status: "open",
    session_type: h.sessionType, session_time: h.sessionTime, lap: h.lap, lap_dist: h.lapDist, description: describe(h), details: h.details,
  }));
  // Doppelte (gleicher hint_key im Event) werden uebersprungen
  const { data: inserted, error: insertError } = await db
    .from("incidents")
    .upsert(rows, { onConflict: "event_id,hint_key", ignoreDuplicates: true })
    .select("id, hint_key");
  if (insertError) return err("Speichern fehlgeschlagen", 500);

  const idByKey = new Map((inserted ?? []).map((r) => [r.hint_key as string, r.id as string]));
  const driverRows = hints.flatMap((h) => {
    const id = idByKey.get(h.key);
    return id ? h.drivers.map((d) => ({ incident_id: id, ingame_name: d.name, car_number: d.num, role: d.role })) : [];
  });
  if (driverRows.length && (await db.from("incident_drivers").insert(driverRows)).error) return err("Beteiligte konnten nicht gespeichert werden", 500);
  return NextResponse.json({ inserted: idByKey.size, duplicates: hints.length - idByKey.size });
}
