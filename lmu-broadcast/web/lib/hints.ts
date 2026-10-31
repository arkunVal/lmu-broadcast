import { INCIDENT_KINDS, type Incident } from "./labels";

export const isHint = (i: Incident) => i.source === "auto" && i.status === "open";

export type HintGroup = {
  id: string;
  items: Incident[];
  first: Incident;          // frühester Hinweis (dort springt das Replay hin)
  keep: Incident;           // wird bei "Ist Vorfall" der Vorfall
  text: string;             // z. B. "2x Kontakt & 1x Überholmanöver"
  drivers: { name: string; num: number | null; possible: boolean }[];
  overtakeOnly: boolean;
  lastTime: number;
};

const PRIORITY = ["contact", "impact", "spin", "offtrack", "track_limits", "other", "overtake"];
const MERGE_WINDOW_S = 20;

const key = (n: string) => n.trim().toLowerCase();

/**
 * Fasst Hinweise zusammen, die kurz nacheinander (20 s) dieselben Fahrer betreffen. Beim Überholen gibt es oft
 * Kontakt, dann steht dort eine Zeile statt fünf.
 */
export function groupHints(hints: Incident[], windowS = MERGE_WINDOW_S): HintGroup[] {
  const sorted = [...hints].sort((a, b) => (a.session_time ?? 0) - (b.session_time ?? 0));
  const groups: { items: Incident[]; names: Set<string>; last: number }[] = [];
  for (const h of sorted) {
    const t = h.session_time ?? 0;
    const names = (h.incident_drivers ?? []).map((d) => key(d.ingame_name));
    const g = groups.find((x) =>
      x.items[0].session_type === h.session_type && t - x.last <= windowS && t >= x.last - windowS && names.some((n) => x.names.has(n)));
    if (g) {
      g.items.push(h);
      names.forEach((n) => g.names.add(n));
      g.last = Math.max(g.last, t);
    } else {
      groups.push({ items: [h], names: new Set(names), last: t });
    }
  }
  const out: HintGroup[] = groups.map((g) => {
    const counts = new Map<string, number>();
    g.items.forEach((i) => counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1));
    const kinds = [...counts.entries()].sort((a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
    const text = g.items.length === 1
      ? INCIDENT_KINDS[g.items[0].kind] ?? g.items[0].kind
      : kinds.map(([k, n]) => `${n}x ${INCIDENT_KINDS[k] ?? k}`).join(" & ");
    const keep = [...g.items].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];
    const dr = new Map<string, { name: string; num: number | null; possible: boolean }>();
    for (const i of g.items) {
      for (const d of i.incident_drivers ?? []) {
        const k = key(d.ingame_name);
        const prev = dr.get(k);
        dr.set(k, { name: d.ingame_name, num: d.car_number ?? prev?.num ?? null, possible: (prev ? prev.possible : true) && d.role === "possible" });
      }
    }
    return {
      id: g.items.map((i) => i.id).join("+"),
      items: g.items,
      first: g.items[0],
      keep,
      text,
      drivers: [...dr.values()],
      overtakeOnly: g.items.every((i) => i.kind === "overtake"),
      lastTime: g.last,
    };
  });
  return out.sort((a, b) => b.lastTime - a.lastTime);
}

export const driversLine = (g: Pick<HintGroup, "drivers">) =>
  g.drivers.map((d) => `${d.num != null ? `#${d.num} ` : ""}${d.name}${d.possible ? " (?)" : ""}`).join(", ") || "–";
