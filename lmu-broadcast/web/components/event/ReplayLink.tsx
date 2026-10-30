"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";
import { useAuth } from "@/lib/auth";
import { fmtClock } from "@/lib/format";
import type { EventRow } from "@/lib/labels";
import { replayStamp } from "@/lib/replay";
import type { Focus } from "@/lib/focus";
import { sendCommand } from "@/lib/commands";
import { getSupabase } from "@/lib/supabase";

type State = { kind: "idle" } | { kind: "wait" } | { kind: "ok"; text: string } | { kind: "fail"; text: string };

/**
 * Zeitstempel fuers LMU-Replay (vom Reader aus dem Spiel gelesen) plus Knopf, der den Reader am Rennrechner
 * anweist, im Spiel-Replay an diese Stelle zu springen. Den Knopf sehen Admins und Rennleitung.
 */
export default function ReplayLink({ event, sessionTime, small, focus, noCopy }: { event: EventRow; sessionTime: number | null; small?: boolean; focus?: Focus | null; noCopy?: boolean }) {
  const { profile } = useAuth();
  const canJump = profile?.role === "admin" || profile?.role === "steward" || profile?.role === "broadcaster";
  const [state, setState] = useState<State>({ kind: "idle" });

  const t = replayStamp(event, sessionTime);
  if (t == null) return null;
  const text = fmtClock(t);

  async function jump() {
    const supabase = getSupabase();
    if (!supabase || t == null) return;
    setState({ kind: "wait" });
    const r = await sendCommand(supabase, event.id, { kind: "jump", time: t, car: focus?.num ?? null, driver: focus?.name ?? null });
    setState(r.ok ? { kind: "ok", text: r.text } : { kind: "fail", text: r.text });
  }

  return (
    <span style={{ display: "inline-flex", flexWrap: small ? "nowrap" : "wrap", alignItems: "center", gap: 8 }} title="Replay von Le Mans Ultimate, 8 Sekunden vor dem Vorfall">
      <span className="muted">{small ? "⏪" : "⏪ LMU-Replay ab"}</span>
      <b className="num">{text}</b>
      {canJump && (
        <button type="button" className={small ? undefined : "primary"} disabled={state.kind === "wait"} onClick={jump} style={small ? { padding: "4px 10px", fontSize: 13 } : undefined}>
          {state.kind === "wait" ? "Sende …" : `▶ Im Spiel anspringen${focus ? ` · ${focus.num != null ? `#${focus.num}` : focus.name}` : ""}`}
        </button>
      )}
      {!noCopy && <span style={small ? { fontSize: 13 } : undefined}><CopyButton text={text} label="Kopieren" /></span>}
      {state.kind === "ok" && !small && <span className="okmsg" style={{ margin: 0 }}>✓ {state.text}</span>}
      {state.kind === "fail" && <span className="err" style={{ margin: 0 }}>{state.text}</span>}
    </span>
  );
}
