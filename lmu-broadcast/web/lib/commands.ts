import type { SupabaseClient } from "@supabase/supabase-js";

export type CommandInput = { kind: "jump" | "focus" | "live" | "next" | "prev" | "camera"; name?: string; time?: number | null; camera?: boolean; car?: string | null; driver?: string | null };
export type CommandResult = { ok: boolean; text: string };

const WAIT_MS = 12_000;

/**
 * Befehl fuer den Reader anlegen und auf sein Ergebnis warten. Der Reader laeuft am Rennrechner und ruft
 * nur die lokale Schnittstelle des Spiels auf (127.0.0.1), nie einen Server von Studio 397.
 */
export async function sendCommand(supabase: SupabaseClient, eventId: string, c: CommandInput): Promise<CommandResult> {
  const { data, error } = await supabase.from("replay_commands").insert({
    // "camera" nutzt die vorhandene Befehlsart "transport" (kein neues SQL noetig): command = "camera:<Name>"
    event_id: eventId, kind: c.kind === "camera" ? "transport" : c.kind, target_time: c.time ?? null,
    command: c.kind === "camera" ? `camera:${(c.name ?? "").slice(0, 60)}` : c.camera ? "camera" : null, car_number: c.car ?? null, driver: c.driver ?? null,
  }).select("id").single();
  if (error || !data) return { ok: false, text: error?.message ?? "Befehl konnte nicht angelegt werden" };
  const id = (data as { id: string }).id;
  const end = Date.now() + WAIT_MS;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 700));
    const { data: row } = await supabase.from("replay_commands").select("status, message").eq("id", id).maybeSingle();
    const r = row as { status: string; message: string | null } | null;
    if (r && r.status !== "pending") return { ok: r.status === "done", text: r.message ?? (r.status === "done" ? "OK" : "Fehlgeschlagen") };
  }
  return { ok: false, text: "Keine Antwort vom Reader. Läuft er am Rennrechner (mit site_url und ingest_token)?" };
}
