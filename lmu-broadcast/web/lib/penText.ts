/** Englische Texte fuer Strafen und Vorfaelle (Overlays). */
export const KIND_EN: Record<string, string> = { contact: "Contact", offtrack: "Off track", track_limits: "Track limits", spin: "Spin", impact: "Impact", overtake: "Overtake", other: "Incident" };
export function penEn(kind: string, amount: number | null, afterRace = false): string {
  const n = amount ?? 0;
  const t = (() => {
    switch (kind) {
      case "warning": return "Warning";
      case "time": return `${n} second time penalty`;
      case "drive_through": return "Drive-through penalty";
      case "stop_go": return `${n} second stop-and-go`;
      case "grid": return `${n} place grid penalty`;
      case "dq": return "Disqualification";
      case "race_ban": return "Race ban";
      case "quali_ban": return "Qualifying ban";
      default: return kind;
    }
  })();
  return afterRace ? `${t} (added after the race)` : t;
}

