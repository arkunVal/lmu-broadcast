// Supabase Edge Function "api": ersetzt die frueheren Next.js-Routen /api/ingest, /api/commands, /api/driver-feed, /api/tracks.
// Aufruf: {SUPABASE_URL}/functions/v1/api/<ingest|commands|driver-feed|tracks/...>  (verify_jwt = false, siehe config.toml)
// Der Service-Key (SUPABASE_SERVICE_ROLE_KEY) gehoert Supabase und wird automatisch bereitgestellt. Er steckt nie in der App.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { cleanHints, describe } from "./ingest.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-ingest-token, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...(init.headers ?? {}) } });
const err = (error: string, status: number) => json({ error }, { status });
const ok = (body: unknown) => json(body);
const NOT_CONFIGURED = () => err("Server nicht konfiguriert", 500);

let client: SupabaseClient | null = null;
function admin(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return (client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

// Einfaches Limit pro IP (im Speicher der Instanz): bremst Raten von Tokens/Schluesseln und Flut.
const hits = new Map<string, { n: number; reset: number }>();
const ip = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
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
const limited = (req: Request, bucket: string, max: number, windowMs = 60_000) => slot(req, bucket, windowMs, true) > max;
const blocked = (req: Request, bucket: string, max: number, windowMs = 60_000) => slot(req, bucket, windowMs, false) >= max;

async function readJson(req: Request, maxBytes = 256 * 1024): Promise<Record<string, unknown> | null> {
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

/** Reader-Token (Header x-ingest-token) -> Event-ID. */
async function eventFromToken(req: Request, db: SupabaseClient): Promise<{ eventId: string } | { res: Response }> {
  if (blocked(req, "auth-fail", 30)) return { res: err("Zu viele Anfragen", 429) };
  const token = req.headers.get("x-ingest-token")?.trim() ?? "";
  const bad = () => { limited(req, "auth-fail", 30); return err("Token fehlt oder ungueltig", 401); };
  if (!/^[0-9a-zA-Z_-]{20,128}$/.test(token)) return { res: bad() };
  const { data, error } = await db.from("event_secrets").select("event_id").eq("ingest_token", token).maybeSingle();
  if (error) return { res: err("Datenbankfehler", 500) };
  if (!data) return { res: bad() };
  return { eventId: (data as { event_id: string }).event_id };
}

const STALE_MS = 60_000;
const MAX_POINTS = 2000;
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// Muss mit track_slug() in reader/track_recorder.py uebereinstimmen.
const trackSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function ingestPost(req: Request) {
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
  return json({ inserted: idByKey.size, duplicates: hints.length - idByKey.size });
}

async function commandsGet(req: Request) {
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

async function commandsPost(req: Request) {
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

async function driverFeed(req: Request) {
  const adm = admin();
  if (!adm) return NOT_CONFIGURED();
  if (limited(req, "feed", 120)) return err("Zu viele Anfragen", 429);
  if (blocked(req, "feed-bad", 20)) return err("Zu viele Anfragen", 429);
  const q = new URL(req.url).searchParams;
  const key = (q.get("k") ?? "").trim();
  const eventId = (q.get("e") ?? "").trim();
  const bad = (m: string, st: number) => { limited(req, "feed-bad", 20); return err(m, st); };
  if (!/^[0-9a-f]{32}$/.test(key) || !/^[0-9a-f-]{36}$/.test(eventId)) return bad("Link ungueltig", 400);

  const { data: k, error: kErr } = await adm.from("driver_overlay_keys").select("profile_id").eq("key", key).maybeSingle();
  if (kErr) return err("Datenbankfehler", 500);
  if (!k) return bad("Schluessel unbekannt", 401);
  const profileId = (k as { profile_id: string }).profile_id;

  const [{ data: ev }, { data: drv }] = await Promise.all([
    adm.from("events").select("id, name").eq("id", eventId).maybeSingle(),
    adm.from("event_drivers").select("ingame_name, car_number, car_class, team").eq("event_id", eventId).eq("profile_id", profileId).maybeSingle(),
  ]);
  if (!ev || !drv) return err("Du bist in diesem Event nicht als Fahrer angemeldet", 403);
  const me = drv as { ingame_name: string; car_number: string | null; car_class: string | null; team: string | null };
  const mine = (name: string | null, num: string | null) => same(name, me.ingame_name) || (me.car_number != null && num === me.car_number);

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [{ data: pens }, { data: incs }, { data: closed }, { data: all }] = await Promise.all([
    adm.from("penalties").select("id, ingame_name, car_number, kind, amount, reason, lap, status, created_at, incident_id, after_race").eq("event_id", eventId).or(`status.eq.issued,and(status.eq.served,created_at.gte.${since})`).order("created_at", { ascending: false }).limit(100),
    adm.from("incidents").select("id, kind, lap, status, created_at, incident_drivers(ingame_name, car_number, role)").eq("event_id", eventId).eq("status", "reviewing").order("created_at", { ascending: false }).limit(10),
    adm.from("incidents").select("id, kind, lap, decision, closed_at, incident_drivers(ingame_name, car_number, role)").eq("event_id", eventId).eq("status", "closed").gte("closed_at", new Date(Date.now() - 40 * 1000).toISOString()).limit(10),
    adm.from("event_drivers").select("ingame_name, car_number, team").eq("event_id", eventId),
  ]);
  const roster = (all ?? []) as { ingame_name: string; car_number: string | null; team: string | null }[];
  const teamOf = (name: string | null, num: string | null) => roster.find((d) => same(d.ingame_name, name) || (num != null && d.car_number === num))?.team ?? null;
  type Dr = { ingame_name: string; car_number: string | null; role: string };
  const involved = (list: unknown) => ((list ?? []) as Dr[]).filter((d) => d.role === "involved").map((d) => ({ name: d.ingame_name, num: d.car_number, team: teamOf(d.ingame_name, d.car_number) }));
  const NFA = /^(no further action|rennunfall, keine strafe|kein vergehen)/i;

  // Wird im Rennen abgesessen? Dann bleibt sie beim betroffenen Fahrer stehen, bis sie abgesessen ist.
  const SERVABLE = ["time", "drive_through", "stop_go"];
  const recent = (pens ?? []).filter((p) => p.created_at >= since || (p.status === "issued" && SERVABLE.includes(p.kind as string) && !p.after_race && mine(p.ingame_name as string, p.car_number as string | null)));
  const penaltyAll = recent.map((p) => ({
    persist: p.status === "issued" && SERVABLE.includes(p.kind as string) && !p.after_race && mine(p.ingame_name as string, p.car_number as string | null),
    afterRace: !!p.after_race,
    id: p.id, name: p.ingame_name, num: p.car_number, team: teamOf(p.ingame_name as string, p.car_number as string | null),
    lap: p.lap, kind: p.kind, amount: p.amount, reason: p.reason, createdAt: p.created_at, mine: mine(p.ingame_name as string, p.car_number as string | null),
  }));
  const reviews = (incs ?? []).map((i) => ({ id: i.id, kind: i.kind, lap: i.lap, drivers: involved(i.incident_drivers), createdAt: i.created_at }));
  const cleared = (closed ?? []).filter((i) => NFA.test(String(i.decision ?? ""))).map((i) => ({ id: i.id, lap: i.lap, drivers: involved(i.incident_drivers), closedAt: i.closed_at }));

  return json(
    { me: { uid: profileId, name: me.ingame_name, num: me.car_number, cls: me.car_class, team: me.team }, event: { id: ev.id, name: ev.name }, penalties: penaltyAll, reviews, cleared, t: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function tracksPost(req: Request) {
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

async function tracksGet(req: Request, slug: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return json({ error: "Server nicht konfiguriert" }, { status: 500 });
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Ungueltiger Name" }, { status: 400 });

  const meta = new URL(req.url).searchParams.get("meta") === "1";
  const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db
    .from("tracks")
    .select(meta ? "slug, name, length, coverage" : "slug, name, length, coverage, points")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return json({ error: "Datenbankfehler" }, { status: 500 });
  if (!data) return json({ error: "Unbekannte Strecke" }, { status: 404 });
  return json(data, { headers: { "Cache-Control": meta ? "no-store" : "public, s-maxage=300, stale-while-revalidate=3600" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    // Pfad nach "/api": /api/ingest, /api/commands, /api/driver-feed, /api/tracks, /api/tracks/<slug>
    const path = new URL(req.url).pathname.replace(/^\/(functions\/v1\/)?api/, "").replace(/\/+$/, "") || "/";
    if (path === "/ingest" && req.method === "POST") return await ingestPost(req);
    if (path === "/commands" && req.method === "GET") return await commandsGet(req);
    if (path === "/commands" && req.method === "POST") return await commandsPost(req);
    if (path === "/driver-feed" && req.method === "GET") return await driverFeed(req);
    if (path === "/tracks" && req.method === "POST") return await tracksPost(req);
    const m = path.match(/^\/tracks\/([^/]+)$/);
    if (m && req.method === "GET") return await tracksGet(req, m[1]);
    return err("Unbekannter Pfad", 404);
  } catch (e) {
    console.error(e);
    return err("Serverfehler", 500);
  }
});
