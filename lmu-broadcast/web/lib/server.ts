import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** Gemeinsame Helfer fuer die API-Routen (nur Server). */

export const err = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
export const ok = (body: unknown) => NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });

let client: SupabaseClient | null = null;
/** Datenbank-Client mit Service-Key. Der Key bleibt nur auf dem Server. */
export function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return (client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

// Einfaches Limit pro IP (im Speicher der Server-Instanz): bremst Raten von Tokens/Schluesseln und Flut.
const hits = new Map<string, { n: number; reset: number }>();
function ip(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}
const slot = (req: Request, bucket: string, windowMs: number, count: boolean) => {
  const key = `${bucket}:${ip(req)}`;
  const now = Date.now();
  let h = hits.get(key);
  if (!h || h.reset < now) {
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    h = { n: 0, reset: now + windowMs };
    hits.set(key, h);
  }
  if (count) h.n++;
  return h.n;
};
/** Zaehlt einen Aufruf; true, wenn die IP das Limit ueberschritten hat. */
export const limited = (req: Request, bucket: string, max: number, windowMs = 60_000) => slot(req, bucket, windowMs, true) > max;
/** Nur nachsehen, nicht zaehlen. */
export const blocked = (req: Request, bucket: string, max: number, windowMs = 60_000) => slot(req, bucket, windowMs, false) >= max;

/** JSON lesen mit Groessenlimit (Standard 256 KB). */
export async function readJson(req: Request, maxBytes = 256 * 1024): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Reader-Token (Header x-ingest-token) -> Event-ID. Gibt bei Fehler direkt die Antwort zurueck. */
export async function eventFromToken(req: Request, db: SupabaseClient): Promise<{ eventId: string } | { res: NextResponse }> {
  if (blocked(req, "auth-fail", 30)) return { res: err("Zu viele Anfragen", 429) };
  const token = req.headers.get("x-ingest-token")?.trim() ?? "";
  const bad = () => { limited(req, "auth-fail", 30); return err("Token fehlt oder ungueltig", 401); };
  if (!/^[0-9a-zA-Z_-]{20,128}$/.test(token)) return { res: bad() };
  const { data, error } = await db.from("event_secrets").select("event_id").eq("ingest_token", token).maybeSingle();
  if (error) return { res: err("Datenbankfehler", 500) };
  if (!data) return { res: bad() };
  return { eventId: (data as { event_id: string }).event_id };
}

export const NOT_CONFIGURED = () => err("Server nicht konfiguriert", 500);
