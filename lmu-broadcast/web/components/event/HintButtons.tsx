"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

/** Ein Auto-Hinweis ist noch kein Vorfall. "Ist Vorfall" setzt ihn auf "In Bearbeitung", "Kein Vorfall" löscht ihn. */
export default function HintButtons({ id, reload, onGone }: { id: string; reload: () => void; onGone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    const { error } = await getSupabase()!.from("incidents").update({ status: "reviewing" }).eq("id", id);
    if (error) setError(error.message);
    setBusy(false);
    reload();
  }

  async function dismiss() {
    setBusy(true);
    setError("");
    const { data, error } = await getSupabase()!.from("incidents").delete().eq("id", id).select("id");
    if (error) setError(error.message);
    else if (!data || data.length === 0) setError("Löschen nicht erlaubt. Datenbank-Update fehlt: supabase/repair.sql ausführen.");
    setBusy(false);
    if (!error && data && data.length > 0) onGone?.();
    reload();
  }

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <button className="primary" disabled={busy} onClick={confirm} title="Wird zum Vorfall, Status: In Bearbeitung">Ist Vorfall</button>
      <button className="danger" disabled={busy} onClick={dismiss} title="Hinweis wird gelöscht">Kein Vorfall</button>
      {error && <span className="err" style={{ margin: 0 }}>{error}</span>}
    </span>
  );
}
