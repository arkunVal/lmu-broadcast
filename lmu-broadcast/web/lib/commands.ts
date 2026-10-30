import type { SupabaseClient } from "@supabase/supabase-js";

export type CommandInput = { kind: "jump" | "focus" | "live"; time?: number | null; car?: number | null; driver?: string | null };
export type CommandResult = { ok: boolean; text: string };

/** Legt einen Befehl fuer den Reader an und wartet bis zu 10 s auf seine Antwort. */
export async function sendCommand(supabase: SupabaseClient, eventId: string, cmd: CommandInput): Promise<CommandResult> {
  const { data, error } = await supabase
    .from("replay_commands")
    .insert({ event_id: eventId, kind: cmd.kind, target_time: cmd.time ?? null, car_number: cmd.car ?? null, driver: cmd.driver ?? null })
    .select("id")
    .single();
  if (error || !data) {
    const m = error?.message ?? "";
    return { ok: false, text: m.includes("replay_commands") || m.includes("car_number") || m.includes("kind") ? "Datenbank-Update fehlt: supabase/repair.sql ausführen." : m || "Senden fehlgeschlagen" };
  }
  const id = (data as { id: string }).id;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { data: row } = await supabase.from("replay_commands").select("status, message").eq("id", id).maybeSingle();
    const r = row as { status: string; message: string | null } | null;
    if (r?.status === "done") return { ok: true, text: r.message ?? "Erledigt" };
    if (r?.status === "failed") return { ok: false, text: r.message ?? "Reader meldet einen Fehler" };
  }
  return { ok: false, text: "Keine Antwort vom Reader. Läuft er am Rennrechner mit dem Key dieses Events?" };
}
