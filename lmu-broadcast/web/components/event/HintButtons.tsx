"use client";

import { useState } from "react";
import { sendCommand } from "@/lib/commands";
import type { Focus } from "@/lib/focus";
import type { EventRow } from "@/lib/labels";
import { replayStamp } from "@/lib/replay";
import { setLooked } from "@/lib/looked";
import { getSupabase } from "@/lib/supabase";

type Props = {
  ids: string[];                 // alle zusammengefassten Hinweise
  keepId?: string;               // dieser wird bei "Ist Vorfall" der Vorfall, die anderen werden gelöscht
  summary?: string;              // Text für die Beschreibung des Vorfalls
  overtakeOnly?: boolean;        // nur Überholmanöver: "Angucken" statt "Ist Vorfall"
  jump?: { event: EventRow; sessionTime: number | null; focus: Focus | null };
  reload: () => void;
  onGone?: () => void;
};

/**
 * Hinweis(e) bearbeiten. Ein Auto-Hinweis ist noch kein Vorfall. "Ist Vorfall" setzt ihn auf "In Bearbeitung",
 * "Kein Vorfall" löscht ihn. Überholmanöver sind nur zum Ansehen: "Angucken" springt im Replay hin, "Erledigt" blendet aus.
 */
export default function HintButtons({ ids, keepId, summary, overtakeOnly, jump, reload, onGone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    const supabase = getSupabase()!;
    const keep = keepId ?? ids[0];
    setBusy(true);
    setError("");
    const patch: Record<string, unknown> = { status: "reviewing" };
    if (ids.length > 1 && summary) patch.description = `Zusammengefasst: ${summary}. Bitte prüfen.`;
    const { error } = await supabase.from("incidents").update(patch).eq("id", keep);
    if (error) setError(error.message);
    else if (ids.length > 1) {
      const rest = ids.filter((i) => i !== keep);
      const del = await supabase.from("incidents").delete().in("id", rest).select("id");
      if (del.error) setError(del.error.message);
    }
    setBusy(false);
    reload();
  }

  async function dismiss() {
    setBusy(true);
    setError("");
    const { data, error } = await getSupabase()!.from("incidents").delete().in("id", ids).select("id");
    if (error) setError(error.message);
    else if (!data || data.length === 0) setError("Löschen nicht erlaubt. Datenbank-Update fehlt: supabase/repair.sql ausführen.");
    setBusy(false);
    if (!error && data && data.length > 0) onGone?.();
    reload();
  }

  async function look() {
    const supabase = getSupabase();
    const t = jump ? replayStamp(jump.event, jump.sessionTime) : null;
    if (!supabase || !jump || t == null) return;
    setBusy(true);
    setError("");
    const r = await sendCommand(supabase, jump.event.id, { kind: "jump", time: t, car: jump.focus?.num ?? null, driver: jump.focus?.name ?? null });
    if (r.ok) setLooked(jump.sessionTime);
    else setError(r.text);
    setBusy(false);
  }

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {overtakeOnly ? (
        <>
          {jump && <button className="primary" disabled={busy} onClick={look} title="Im Spiel-Replay an die Stelle springen">Angucken</button>}
          <button disabled={busy} onClick={dismiss} title="Hinweis ausblenden (löschen)">Erledigt</button>
        </>
      ) : (
        <>
          <button className="primary" disabled={busy} onClick={confirm} title="Wird zum Vorfall, Status: In Bearbeitung">Ist Vorfall</button>
          <button className="danger" disabled={busy} onClick={dismiss} title="Hinweis wird gelöscht">Kein Vorfall</button>
        </>
      )}
      {error && <span className="err" style={{ margin: 0 }}>{error}</span>}
    </span>
  );
}
