"use client";

import CopyButton from "@/components/CopyButton";
import { fmtClock } from "@/lib/format";
import type { EventRow } from "@/lib/labels";
import { replayStamp } from "@/lib/replay";

/** Zeitstempel fuer das LMU-Replay (vom Reader aus dem Spiel gelesen). Im Spiel: Replay, Zeit anspringen. */
export default function ReplayLink({ event, sessionTime, small }: { event: EventRow; sessionTime: number | null; small?: boolean }) {
  const t = replayStamp(event, sessionTime);
  if (t == null) return null;
  const text = fmtClock(t);
  return (
    <span className="row" style={{ gap: 8, display: "inline-flex", alignItems: "center" }} title="Im Replay von Le Mans Ultimate diese Zeit anspringen (8 Sekunden vor dem Vorfall)">
      <span className="muted">{small ? "⏪" : "⏪ LMU-Replay ab"}</span>
      <b className="num">{text}</b>
      <span style={small ? { fontSize: 13 } : undefined}><CopyButton text={text} label="Kopieren" /></span>
    </span>
  );
}
