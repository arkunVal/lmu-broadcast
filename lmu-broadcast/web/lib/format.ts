export function fmtTime(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

export function fmtGap(seconds: number | null | undefined): string {
  return seconds == null ? "–" : `+${seconds.toFixed(1)}`;
}

const SESSION_NAMES: [number, number, string][] = [
  [0, 0, "Testtag"],
  [1, 4, "Training"],
  [5, 8, "Qualifying"],
  [9, 9, "Warm-up"],
  [10, 13, "Rennen"],
];

export function sessionName(type: number): string {
  return SESSION_NAMES.find(([a, b]) => type >= a && type <= b)?.[2] ?? "Unbekannt";
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
