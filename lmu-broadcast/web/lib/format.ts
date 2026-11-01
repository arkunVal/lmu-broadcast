export function fmtTime(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

export function fmtGap(seconds: number | null | undefined): string {
  return seconds == null ? "–" : `+${seconds.toFixed(1)}`;
}

const PHASES: Record<number, string> = {
  0: "Vor Sessionstart",
  1: "Aufklärungsrunden",
  2: "Grid-Walk",
  3: "Einführungsrunde",
  4: "Startampel",
  5: "Grün",
  6: "Full Course Yellow / Safety Car",
  7: "Session gestoppt",
  8: "Session beendet",
  9: "Pausiert",
};

export function phaseName(phase: number): string {
  return PHASES[phase] ?? `Phase ${phase}`;
}

export function fmtClock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
