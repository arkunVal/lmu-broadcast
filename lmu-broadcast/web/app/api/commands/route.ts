import { admin, err, eventFromToken, limited, NOT_CONFIGURED, ok, readJson } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_MS = 60_000;

/**
 * Befehle von der Website an den Reader (Replay-Sprung, Auto waehlen, zurueck zu Live).
 * GET  : der Reader holt offene Befehle ab (Header x-ingest-token).
 * POST : der Reader meldet das Ergebnis {id, status: "done" | "failed", message}.
 */
export async function GET(req: Request) {
  const db = admin();
  if (!db) return NOT_CONFIGURED();
  if (limited(req, "commands", 120)) return err("Zu viele Anfragen", 429);
  const auth = await eventFromToken(req, db);
  if ("res" in auth) return auth.res;
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  await db.from("replay_commands").update({ status: "failed", message: "Reader hat nicht rechtzeitig geantwortet", done_at: new Date().toISOString() })
    .eq("event_id", auth.eventId).eq("status", "pending").lt("created_at", stale);
  const { data, error } = await db.from("replay_commands").select("id, kind, command, target_time, car_number, driver, created_at")
    .eq("event_id", auth.eventId).eq("status", "pending").order("created_at", { ascending: true }).limit(5);
  if (error) return err("Datenbankfehler", 500);
  return ok({ commands: data ?? [] });
}

export async function POST(req: Request) {
  const db = admin();
  if (!db) return NOT_CONFIGURED();
  if (limited(req, "commands-post", 120)) return err("Zu viele Anfragen", 429);
  const auth = await eventFromToken(req, db);
  if ("res" in auth) return auth.res;
  const body = await readJson(req, 4 * 1024);
  if (!body) return err("Kein gueltiges JSON", 400);
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  const status = body.status === "done" || body.status === "failed" ? body.status : null;
  if (!id || !status) return err("id und status (done|failed) erwartet", 400);
  const message = typeof body.message === "string" ? body.message.slice(0, 300) : null;
  const { error } = await db.from("replay_commands").update({ status, message, done_at: new Date().toISOString() })
    .eq("id", id).eq("event_id", auth.eventId).eq("status", "pending");
  return error ? err("Speichern fehlgeschlagen", 500) : ok({ ok: true });
}
