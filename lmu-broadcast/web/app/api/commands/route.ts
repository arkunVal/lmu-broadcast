import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AGE_MS = 2 * 60 * 1000; // aeltere Befehle sind nicht mehr interessant

function setup(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { error: NextResponse.json({ error: "Server nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY fehlt)" }, { status: 500 }) };
  const token = req.headers.get("x-ingest-token")?.trim() ?? "";
  if (token.length < 20) return { error: NextResponse.json({ error: "Token fehlt oder ungueltig" }, { status: 401 }) };
  return { url, serviceKey, token };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function eventOf(admin: any, token: string): Promise<string | null | "error"> {
  const { data, error } = await admin.from("event_secrets").select("event_id").eq("ingest_token", token).maybeSingle();
  if (error) return "error";
  return data ? ((data as { event_id: string }).event_id) : null;
}

/** Der Reader holt hier offene Befehle ab (z. B. Replay-Sprung). Header: x-ingest-token. */
export async function GET(req: Request) {
  const s = setup(req);
  if (s.error) return s.error;
  const admin = createClient(s.url, s.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const eventId = await eventOf(admin, s.token);
  if (eventId === "error") return NextResponse.json({ error: "Datenbankfehler" }, { status: 500 });
  if (!eventId) return NextResponse.json({ error: "Token unbekannt" }, { status: 401 });

  const since = new Date(Date.now() - MAX_AGE_MS).toISOString();
  const { data, error } = await admin
    .from("replay_commands")
    .select("id, kind, target_time, car_number, driver")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) return NextResponse.json({ error: "Datenbankfehler" }, { status: 500 });
  return NextResponse.json({ commands: (data ?? []).map((c) => ({ id: c.id, kind: c.kind, time: c.target_time, car: c.car_number, driver: c.driver })) });
}

/** Der Reader meldet das Ergebnis: { id, status: "done" | "failed", message } */
export async function POST(req: Request) {
  const s = setup(req);
  if (s.error) return s.error;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Kein gueltiges JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const status = body.status === "done" ? "done" : body.status === "failed" ? "failed" : "";
  const message = typeof body.message === "string" ? body.message.slice(0, 300) : null;
  if (!id || !status) return NextResponse.json({ error: "id/status fehlt" }, { status: 400 });

  const admin = createClient(s.url, s.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const eventId = await eventOf(admin, s.token);
  if (eventId === "error") return NextResponse.json({ error: "Datenbankfehler" }, { status: 500 });
  if (!eventId) return NextResponse.json({ error: "Token unbekannt" }, { status: 401 });

  const { error } = await admin
    .from("replay_commands")
    .update({ status, message, done_at: new Date().toISOString() })
    .eq("id", id)
    .eq("event_id", eventId);
  if (error) return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
