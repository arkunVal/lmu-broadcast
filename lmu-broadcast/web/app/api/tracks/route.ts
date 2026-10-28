import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { trackSlug } from "@/lib/tracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_POINTS = 2000;

/**
 * Der Reader laedt hier eine aufgenommene Streckenkarte hoch.
 * Header: x-ingest-token (gleicher geheimer Token wie fuer die Vorfall-Hinweise).
 * Eine vorhandene Karte wird nur ersetzt, wenn die neue besser abgedeckt ist.
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY fehlt)" }, { status: 500 });
  }
  const token = req.headers.get("x-ingest-token")?.trim() ?? "";
  if (token.length < 20) return NextResponse.json({ error: "Token fehlt oder ungueltig" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Kein gueltiges JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const slug = trackSlug(name);
  const length = Number(body.length);
  const coverage = Number(body.coverage);
  const points = body.points;
  if (!slug || !slug.match(/^[a-z0-9-]{1,80}$/)) return NextResponse.json({ error: "Streckenname fehlt" }, { status: 400 });
  if (!(coverage > 0 && coverage <= 1)) return NextResponse.json({ error: "coverage muss zwischen 0 und 1 liegen" }, { status: 400 });
  if (!Array.isArray(points) || points.length < 10 || points.length > MAX_POINTS) {
    return NextResponse.json({ error: "points: 10 bis 2000 Punkte erwartet" }, { status: 400 });
  }
  const clean: [number, number][] = [];
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return NextResponse.json({ error: "points: jeder Punkt muss [x, z] sein" }, { status: 400 });
    }
    clean.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: secret, error: secretError } = await admin
    .from("event_secrets")
    .select("event_id")
    .eq("ingest_token", token)
    .maybeSingle();
  if (secretError) return NextResponse.json({ error: "Datenbankfehler" }, { status: 500 });
  if (!secret) return NextResponse.json({ error: "Token unbekannt" }, { status: 401 });

  const { data: existing } = await admin.from("tracks").select("coverage").eq("slug", slug).maybeSingle();
  if (existing && Number(existing.coverage) >= coverage) {
    return NextResponse.json({ ok: true, saved: false, reason: "bessere Karte schon vorhanden" });
  }
  const { error } = await admin.from("tracks").upsert({
    slug,
    name,
    length: Number.isFinite(length) && length > 0 ? length : null,
    coverage,
    points: clean,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
  return NextResponse.json({ ok: true, saved: true, slug });
}
