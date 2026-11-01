import { trackSlug } from "@/lib/tracks";
import { admin, err, eventFromToken, limited, NOT_CONFIGURED, ok, readJson } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_POINTS = 2000;

/**
 * Der Reader laedt hier eine aufgenommene Streckenkarte hoch.
 * Header: x-ingest-token (gleicher geheimer Token wie fuer die Vorfall-Hinweise).
 * Eine vorhandene Karte wird nur ersetzt, wenn die neue besser abgedeckt ist.
 */
export async function POST(req: Request) {
  const db = admin();
  if (!db) return NOT_CONFIGURED();
  if (limited(req, "tracks", 20)) return err("Zu viele Anfragen", 429);
  const auth = await eventFromToken(req, db);
  if ("res" in auth) return auth.res;
  const body = await readJson(req, 200 * 1024);
  if (!body) return err("Kein gueltiges JSON", 400);

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const slug = trackSlug(name);
  const length = Number(body.length);
  const coverage = Number(body.coverage);
  const points = body.points;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return err("Streckenname fehlt", 400);
  if (!(coverage > 0 && coverage <= 1)) return err("coverage muss zwischen 0 und 1 liegen", 400);
  if (!Array.isArray(points) || points.length < 10 || points.length > MAX_POINTS) return err("points: 10 bis 2000 Punkte erwartet", 400);
  const clean: [number, number][] = [];
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 1e6 || Math.abs(p[1]) > 1e6) return err("points: jeder Punkt muss [x, z] sein", 400);
    clean.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }

  const { data: existing } = await db.from("tracks").select("coverage").eq("slug", slug).maybeSingle();
  if (existing && Number(existing.coverage) >= coverage) return ok({ ok: true, saved: false, reason: "bessere Karte schon vorhanden" });
  const { error } = await db.from("tracks").upsert({
    slug, name, length: Number.isFinite(length) && length > 0 && length < 1e6 ? length : null, coverage, points: clean, updated_at: new Date().toISOString(),
  });
  return error ? err("Speichern fehlgeschlagen", 500) : ok({ ok: true, saved: true, slug });
}
