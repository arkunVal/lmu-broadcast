"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

/** Löscht ein Event samt Vorfällen, Strafen, Fahrern und Befehlen. Nur Admins. Zwei Schritte gegen Versehen. */
export default function DeleteEvent({ id, name, onDeleted, compact }: { id: string; name: string; onDeleted: () => void; compact?: boolean }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const { data, error } = await getSupabase()!.from("events").delete().eq("id", id).select("id");
    setBusy(false);
    if (error) return setError(error.message);
    if (!data || data.length === 0) return setError("Löschen nicht erlaubt (nur Admins).");
    onDeleted();
  }

  if (!ask) {
    return <button className="danger" style={compact ? { padding: "4px 10px", fontSize: 13 } : undefined} onClick={() => setAsk(true)}>{compact ? "Löschen" : "Event löschen"}</button>;
  }
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <span>{compact ? "Wirklich?" : `„${name}“ mit allen Vorfällen, Strafen und Fahrern endgültig löschen?`}</span>
      <button className="danger" disabled={busy} onClick={remove}>{busy ? "Lösche …" : "Ja, löschen"}</button>
      <button disabled={busy} onClick={() => setAsk(false)}>Abbrechen</button>
      {error && <span className="err" style={{ margin: 0 }}>{error}</span>}
    </span>
  );
}
