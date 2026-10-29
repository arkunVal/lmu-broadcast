import type { Incident } from "./labels";

export type Focus = { num: number | null; name: string };

/** Welches Auto im Replay angewaehlt werden soll: der erste Beteiligte ("involved"), sonst der erste moegliche. */
export function pickFocus(incident: Pick<Incident, "incident_drivers">): Focus | null {
  const list = incident.incident_drivers ?? [];
  const d = list.find((x) => x.role === "involved") ?? list[0];
  return d ? { num: d.car_number, name: d.ingame_name } : null;
}
