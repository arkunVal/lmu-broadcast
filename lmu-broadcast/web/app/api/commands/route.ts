import { admin, err, eventFromToken, limited, NOT_CONFIGURED, ok, readJson } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AGE_MS = 2 * 60 * 1000; // aeltere Befehle sind nicht mehr interessant

/** Der Reader holt hier offene Befehle ab (z. B. Replay-Sprung). Header: x-ingest-token. */
export async function GET(req: Request) {
  const db = admin();
  if (!db) return NOT_CONFIGURED();
  if (limited(req, "commands", 240)) return err("Zu viele Anfragen", 429);
  const auth = await eventFromToken(req, db);
  if ("res" in auth) return auth.res;
  const { data, error } = await db
    .from("replay_commands")
    .select("id, kind, target_time, car_number, driver, command")
    .eq("event_id", auth.eventId)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - MAX_AGE_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) return err("Datenbankfehler", 500);
  return ok({ commands: (data ?? []).map((c) => ({ id: c.id, kind: c.kind, time: c.target_time, car: c.car_number, driver: c.driver, command: c.command })) });
}

/** Der Reader meldet das Ergebnis: { id, status: "done" | "failed", message } */
export async function POST(req: Request) {
  const db = admin();
  if (!db) return NOT_CONFIGURED();
  if (limited(req, "commands", 240)) return err("Zu viele Anfragen", 429);
  const auth = await eventFromToken(req, db);
  if ("res" in auth) return auth.res;
  const body = await readJson(req, 8 * 1024);
  if (!body) return err("Kein gueltiges JSON", 400);
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/.test(body.id) ? body.id : "";
  const status = body.status === "done" || body.status === "failed" ? body.status : "";
  if (!id || !status) return err("id/status fehlt", 400);
  const message = typeof body.message === "string" ? body.message.slice(0, 300) : null;
  const { error } = await db.from("replay_commands").update({ status, message, done_at: new Date().toISOString() }).eq("id", id).eq("event_id", auth.eventId);
  return error ? err("Speichern fehlgeschlagen", 500) : ok({ ok: true });
}
