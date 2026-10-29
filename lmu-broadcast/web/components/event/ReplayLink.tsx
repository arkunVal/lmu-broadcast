"use client";

import { useEffect, useRef, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { useAuth } from "@/lib/auth";
import { fmtClock } from "@/lib/format";
import type { EventRow } from "@/lib/labels";
import { replayStamp } from "@/lib/replay";
import { getSupabase } from "@/lib/supabase";

type State = { kind: "idle" } | { kind: "wait" } | { kind: "ok"; text: string } | { kind: "fail"; text: string };

/**
 * Zeitstempel fuers LMU-Replay (vom Reader aus dem Spiel gelesen) plus Knopf, der den Reader am Rennrechner
 * anweist, im Spiel-Replay an diese Stelle zu springen. Den Knopf sehen Admins und Rennleitung.
 */
export default function ReplayLink({ event, sessionTime, small }: { event: EventRow; sessionTime: number | null; small?: boolean }) {
  const { profile } = useAuth();
  const canJump = profile?.role === "admin" || profile?.role === "steward";
  const [state, setState] = useState<State>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const t = replayStamp(event, sessionTime);
  if (t == null) return null;
  const text = fmtClock(t);

  async function jump() {
    const supabase = getSupabase();
    if (!supabase || t == null) return;
    setState({ kind: "wait" });
    const { data, error } = await supabase.from("replay_commands").insert({ event_id: event.id, target_time: t }).select("id").single();
    if (error || !data) {
      setState({ kind: "fail", text: error?.message?.includes("replay_commands") ? "Datenbank-Update fehlt: supabase/repair.sql ausführen." : (error?.message ?? "Senden fehlgeschlagen") });
      return;
    }
    const id = (data as { id: string }).id;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      const { data: row } = await supabase.from("replay_commands").select("status, message").eq("id", id).maybeSingle();
      const r = row as { status: string; message: string | null } | null;
      if (r?.status === "done") return setState({ kind: "ok", text: r.message ?? "Replay springt" });
      if (r?.status === "failed") return setState({ kind: "fail", text: r.message ?? "Reader meldet einen Fehler" });
      if (tries >= 10) return setState({ kind: "fail", text: "Keine Antwort vom Reader. Läuft er am Rennrechner mit dem Key dieses Events?" });
      timer.current = setTimeout(poll, 1000);
    };
    timer.current = setTimeout(poll, 1000);
  }

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 8 }} title="Replay von Le Mans Ultimate, 8 Sekunden vor dem Vorfall">
      <span className="muted">{small ? "⏪" : "⏪ LMU-Replay ab"}</span>
      <b className="num">{text}</b>
      {canJump && (
        <button type="button" className={small ? undefined : "primary"} disabled={state.kind === "wait"} onClick={jump} style={small ? { padding: "4px 10px", fontSize: 13 } : undefined}>
          {state.kind === "wait" ? "Sende …" : "▶ Im Spiel anspringen"}
        </button>
      )}
      <span style={small ? { fontSize: 13 } : undefined}><CopyButton text={text} label="Kopieren" /></span>
      {state.kind === "ok" && <span className="okmsg" style={{ margin: 0 }}>✓ {state.text}</span>}
      {state.kind === "fail" && <span className="err" style={{ margin: 0 }}>{state.text}</span>}
    </span>
  );
}
