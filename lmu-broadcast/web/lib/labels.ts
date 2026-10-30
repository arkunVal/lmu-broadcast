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
  reviewing: "In Bearbeitung",
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

/** Auswahl "Entscheidung der Rennleitung" beim Vorfall. kind/amount füllen das Strafformular vor. */
export type DecisionOption = { label: string; kind?: PenaltyKind; amount?: number };
export const DECISION_OPTIONS: DecisionOption[] = [
  { label: "Rennunfall, keine Strafe" },
  { label: "Kein Vergehen" },
  { label: "Verwarnung", kind: "warning" },
  { label: "+5 s Zeitstrafe", kind: "time", amount: 5 },
  { label: "+10 s Zeitstrafe", kind: "time", amount: 10 },
  { label: "+15 s Zeitstrafe", kind: "time", amount: 15 },
  { label: "+30 s Zeitstrafe", kind: "time", amount: 30 },
  { label: "Drive-Through", kind: "drive_through" },
  { label: "Stop-and-Go 10 s", kind: "stop_go", amount: 10 },
  { label: "Positions-/Startplatzstrafe", kind: "grid", amount: 3 },
  { label: "Disqualifikation", kind: "dq" },
  { label: "Rennsperre", kind: "race_ban", amount: 1 },
  { label: "Qualisperre", kind: "quali_ban", amount: 1 },
];

/** Begründungen für Strafen, gruppiert wie in der Rennleitungs-Auswahl. */
export const PENALTY_REASONS: { group: string; items: string[] }[] = [
  { group: "General", items: ["Causing a collision", "Unsafe rejoin", "Pit lane infringement", "FCY infringement", "SC infringement"] },
  { group: "Overtaking", items: ["Overtaking under SC", "Overtaking before green flag", "Overtaking same-class car during SC phase", "Overtaking before S/F line at restart"] },
  { group: "Track limits", items: ["Track limits violation"] },
  { group: "Defending", items: ["Excessive defensive move", "Reactionary / blocking move", "Moving under braking"] },
  { group: "Contact", items: ["Causing contact – minor", "Causing contact – significant", "Causing contact – major"] },
  { group: "Flags", items: ["Blue flag violation – within class", "Blue flag violation – outside class", "Overtaking under yellow flag", "Causing collision under yellow flag"] },
  { group: "SC specific", items: ["Speeding under SC", "Exceeding 120 km/h during pass-around", "Exceeding 60 km/h during SC deployment", "Overtaking SC without RC instruction", "Weaving before SC in this lap call"] },
  { group: "FCY specific", items: ["Speeding under FCY", "Overtaking under FCY", "Driving below 40 km/h during FCY", "Pitting during FCY – sufficient fuel", "Pitting during FCY – fuel emergency", "Side by side at FCY – not falling back"] },
  { group: "Pitlane", items: ["Crossing pit entry line", "Crossing pit exit line", "Overtaking in slow lane", "Unsafe release", "Leaving pits too early"] },
  { group: "Qualifying", items: ["Bumpdrafting in qualifying", "Impeding / blocking in qualifying", "Entering Hyperpole without Top 10"] },
  { group: "Misc", items: ["In-game chat during session", "Driver Control not connected", "Flag overlays inactive", "Race start violation", "Not holding brakes after incident", "Inter-class teaming"] },
];

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
  replay_offset?: number;
  classes?: string[];
  is_team_event?: boolean;
};

export type EventDriver = {
  id: string;
  event_id: string;
  ingame_name: string;
  car_number: number | null;
  car_class: string | null;
  team: string | null;
  team_id?: string | null;
  profile_id?: string | null;
  is_captain?: boolean;
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
  lap: number | null;
  session_time: number | null;
  status: "issued" | "served" | "revoked";
  created_at: string;
};

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}
