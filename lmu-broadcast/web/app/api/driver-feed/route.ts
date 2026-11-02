import { NextResponse } from "next/server";
import { admin as db, blocked, err, limited, NOT_CONFIGURED } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Daten fuer das persoenliche Fahrer-Overlay (SimHub): GET /api/driver-feed?k=<Schluessel>&e=<Event-ID>
 * Der Schluessel gehoert einem Fahrer (Session-Tab). Liefert Strafen der letzten 10 min, Vorfaelle "in Bearbeitung"
 * und eben abgeschlossene "No further action"-Faelle fuer ALLE Fahrer des Events (wie die TV-Einblendung).
 */
export async function GET(req: Request) {
  const admin = db();
  if (!admin) return NOT_CONFIGURED();
  if (limited(req, "feed", 120)) return err("Zu viele Anfragen", 429);
  if (blocked(req, "feed-bad", 20)) return err("Zu viele Anfragen", 429);
  const q = new URL(req.url).searchParams;
  const key = (q.get("k") ?? "").trim();
  const eventId = (q.get("e") ?? "").trim();
  const bad = (m: string, st: number) => { limited(req, "feed-bad", 20); return err(m, st); };
  if (!/^[0-9a-f]{32}$/.test(key) || !/^[0-9a-f-]{36}$/.test(eventId)) return bad("Link ungueltig", 400);

  const { data: k, error: kErr } = await admin.from("driver_overlay_keys").select("profile_id").eq("key", key).maybeSingle();
  if (kErr) return err("Datenbankfehler", 500);
  if (!k) return bad("Schluessel unbekannt", 401);
  const profileId = (k as { profile_id: string }).profile_id;

  const [{ data: ev }, { data: drv }] = await Promise.all([
    admin.from("events").select("id, name").eq("id", eventId).maybeSingle(),
    admin.from("event_drivers").select("ingame_name, car_number, car_class, team").eq("event_id", eventId).eq("profile_id", profileId).maybeSingle(),
  ]);
  if (!ev || !drv) return err("Du bist in diesem Event nicht als Fahrer angemeldet", 403);
  const me = drv as { ingame_name: string; car_number: string | null; car_class: string | null; team: string | null };
  const mine = (name: string | null, num: string | null) => same(name, me.ingame_name) || (me.car_number != null && num === me.car_number);

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [{ data: pens }, { data: incs }, { data: closed }, { data: all }] = await Promise.all([
    admin.from("penalties").select("id, ingame_name, car_number, kind, amount, reason, lap, status, created_at, incident_id, after_race").eq("event_id", eventId).or(`status.eq.issued,and(status.eq.served,created_at.gte.${since})`).order("created_at", { ascending: false }).limit(100),
    admin.from("incidents").select("id, kind, lap, status, created_at, incident_drivers(ingame_name, car_number, role)").eq("event_id", eventId).eq("status", "reviewing").order("created_at", { ascending: false }).limit(10),
    admin.from("incidents").select("id, kind, lap, decision, closed_at, incident_drivers(ingame_name, car_number, role)").eq("event_id", eventId).eq("status", "closed").gte("closed_at", new Date(Date.now() - 40 * 1000).toISOString()).limit(10),
    admin.from("event_drivers").select("ingame_name, car_number, team").eq("event_id", eventId),
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

  return NextResponse.json(
    { me: { uid: profileId, name: me.ingame_name, num: me.car_number, cls: me.car_class, team: me.team }, event: { id: ev.id, name: ev.name }, penalties: penaltyAll, reviews, cleared, t: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
