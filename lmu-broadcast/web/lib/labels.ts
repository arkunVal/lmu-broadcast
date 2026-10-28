export const INCIDENT_KINDS: Record<string, string> = {
  offtrack: "Streckenverlassen",
  track_limits: "Track Limits",
  contact: "Kontakt",
  spin: "Dreher",
  impact: "Aufprall",
  other: "Sonstiges",
};

export const INCIDENT_STATUS: Record<string, string> = {
  open: "Offen",
  reviewing: "In Prüfung",
  closed: "Abgeschlossen",
};

export const CONFIDENCE: Record<string, string> = { low: "niedrig", medium: "mittel", high: "hoch" };

export const ROLES: Record<string, string> = {
  admin: "Admin",
  steward: "Rennleiter / Steward",
  driver: "Fahrer",
  broadcaster: "Kommentator / Broadcaster",
};

export type PenaltyKind = "warning" | "time" | "drive_through" | "stop_go" | "grid" | "dq" | "race_ban" | "quali_ban";

export const PENALTY_KINDS: Record<PenaltyKind, { label: string; unit: string | null }> = {
  warning: { label: "Verwarnung", unit: null },
  time: { label: "Zeitstrafe", unit: "Sekunden" },
  drive_through: { label: "Drive-Through", unit: null },
  stop_go: { label: "Stop-and-Go", unit: "Sekunden Standzeit" },
  grid: { label: "Positions-/Startplatzstrafe", unit: "Plätze" },
  dq: { label: "Disqualifikation", unit: null },
  race_ban: { label: "Rennsperre", unit: "Rennen" },
  quali_ban: { label: "Qualisperre", unit: "Qualis" },
};

export const PENALTY_STATUS: Record<string, string> = {
  issued: "Verhängt",
  served: "Abgesessen",
  revoked: "Zurückgenommen",
};

export function penaltyText(kind: string, amount: number | null): string {
  const k = PENALTY_KINDS[kind as PenaltyKind];
  if (!k) return kind;
  if (k.unit && amount != null) {
    if (kind === "time") return `+${amount} s Zeitstrafe`;
    if (kind === "grid") return `${amount} Plätze zurück`;
    return `${k.label}: ${amount} ${k.unit}`;
  }
  return k.label;
}

export const SESSION_TYPES: { value: number; label: string }[] = [
  { value: 1, label: "Training" },
  { value: 5, label: "Qualifying" },
  { value: 10, label: "Rennen" },
];

export type Role = "admin" | "steward" | "driver" | "broadcaster";

/** role ist null, solange die Anmeldung (Rolle + Code) noch nicht abgeschlossen ist. */
export type Profile = {
  id: string;
  display_name: string;
  ingame_name: string | null;
  role: Role | null;
};

export const ROLE_INFO: { role: Role; title: string; text: string; codeLabel: string; codeHint: string }[] = [
  { role: "driver", title: "Fahrer", text: "Du fährst mit. Du siehst abgeschlossene Vorfälle und Strafen deiner Events.", codeLabel: "Event-Code", codeHint: "z. B. EVT-7K3F-92AB, den bekommst du von der Rennleitung" },
  { role: "broadcaster", title: "Broadcast", text: "Du kommentierst oder streamst. Du siehst Live-Daten und bekommst die OBS-Overlays.", codeLabel: "Broadcast-Key", codeHint: "beginnt mit BRC-, den gibt dir ein Admin" },
  { role: "steward", title: "Rennleitung", text: "Du prüfst Vorfälle und vergibst Strafen.", codeLabel: "Steward-Key", codeHint: "beginnt mit STW-, den gibt dir ein Admin" },
  { role: "admin", title: "Admin", text: "Du legst Events an und verwaltest Rollen, Keys und Strecken.", codeLabel: "Admin-Key", codeHint: "beginnt mit ADM-, steht im Admin-Bereich" },
];

export type EventRow = {
  id: string;
  name: string;
  track: string | null;
  track_slug: string | null;
  code: string;
  room: string;
  starts_at: string | null;
  status: "planned" | "live" | "finished";
};

export type EventDriver = {
  id: string;
  event_id: string;
  ingame_name: string;
  car_number: number | null;
  car_class: string | null;
  team: string | null;
};

export type IncidentDriver = { id: string; incident_id: string; ingame_name: string; car_number: number | null; role: "involved" | "possible" };

export type Incident = {
  id: string;
  event_id: string;
  source: "manual" | "auto";
  kind: string;
  confidence: string | null;
  status: "open" | "reviewing" | "closed";
  session_type: number | null;
  session_time: number | null;
  lap: number | null;
  lap_dist: number | null;
  description: string;
  details: Record<string, unknown>;
  decision: string | null;
  created_at: string;
  closed_at: string | null;
  incident_drivers: IncidentDriver[];
};

export type Penalty = {
  id: string;
  event_id: string;
  incident_id: string | null;
  ingame_name: string;
  car_number: number | null;
  kind: PenaltyKind;
  amount: number | null;
  reason: string;
  status: "issued" | "served" | "revoked";
  created_at: string;
};

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}
