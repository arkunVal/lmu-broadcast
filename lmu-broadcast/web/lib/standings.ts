import { classRank } from "./classes";
import type { Car } from "./types";

export type SessionKind = "practice" | "quali" | "race";

// Spiel: 0 = Testtag, 1-4 = Training, 5-8 = Quali, 9 = Warm-up, 10-13 = Rennen
export function sessionKind(type: number): SessionKind {
  if (type >= 10) return "race";
  if (type >= 5 && type <= 8) return "quali";
  return "practice";
}

export function sessionLabel(type: number): string {
  if (type >= 10) return "RENNEN";
  if (type >= 5 && type <= 8) return "QUALIFYING";
  if (type === 9) return "WARM-UP";
  if (type === 0) return "TESTTAG";
  return "TRAINING";
}

export type Row = {
  car: Car;
  classPos: number;
  /** Abstand zum Klassenfuehrer (Rennen) bzw. zur Klassenbestzeit (Training/Quali) */
  gapLeader: string;
  /** Abstand zum Auto davor in der Klasse (nur Rennen) */
  gapInterval: string;
};

export type Group = {
  cls: string;
  rows: Row[];
  bestLap: number | null;
};

function totalLaps(c: Car): number {
  return c.laps + (c.lapFrac ?? 0);
}

function timeGap(ahead: Car, behind: Car, ahead0: Car): string {
  const lapsApart = totalLaps(ahead) - totalLaps(behind);
  if (lapsApart >= 1) return `+${Math.floor(lapsApart)}L`;
  const diff = (behind.gapLeader ?? 0) - (ahead0.gapLeader ?? 0);
  return diff > 0 ? `+${diff.toFixed(1)}` : "+0.0";
}

export function buildGroups(cars: Car[], kind: SessionKind, onlyClass?: string): Group[] {
  const byClass = new Map<string, Car[]>();
  for (const c of cars) {
    const key = c.cls || "–";
    if (onlyClass && !key.toLowerCase().includes(onlyClass.toLowerCase())) continue;
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key)!.push(c);
  }

  const groups: Group[] = [];
  for (const [cls, list] of byClass) {
    const sorted = [...list].sort((a, b) => {
      if (kind === "race") return a.place - b.place;
      const ba = a.bestLap ?? Infinity;
      const bb = b.bestLap ?? Infinity;
      return ba !== bb ? ba - bb : a.place - b.place;
    });
    const best = sorted.reduce<number | null>(
      (m, c) => (c.bestLap != null && (m == null || c.bestLap < m) ? c.bestLap : m),
      null,
    );
    const leader = sorted[0];
    const rows: Row[] = sorted.map((car, i) => {
      if (kind === "race") {
        return {
          car,
          classPos: i + 1,
          gapLeader: i === 0 ? "" : timeGap(leader, car, leader),
          gapInterval: i === 0 ? "" : timeGap(sorted[i - 1], car, sorted[i - 1]),
        };
      }
      const delta = car.bestLap != null && best != null ? car.bestLap - best : null;
      return {
        car,
        classPos: i + 1,
        gapLeader: i === 0 ? "" : delta == null ? "–" : `+${delta.toFixed(3)}`,
        gapInterval: "",
      };
    });
    groups.push({ cls, rows, bestLap: best });
  }
  return groups.sort((a, b) => classRank(a.cls) - classRank(b.cls) || a.cls.localeCompare(b.cls));
}

export function overallFastest(cars: Car[]): Car | null {
  let best: Car | null = null;
  for (const c of cars) {
    if (c.bestLap != null && (best == null || c.bestLap < (best.bestLap as number))) best = c;
  }
  return best;
}

export function shortName(full: string, mode: "full" | "short" | "tla"): string {
  if (mode === "full") return full;
  const parts = full.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? full;
  if (mode === "tla") return last.slice(0, 3).toUpperCase();
  return parts.length > 1 ? `${parts[0][0]}. ${last}` : full;
}

export function tireLetter(tire: Car["tire"]): { letter: string; color: string } | null {
  if (!tire) return null;
  const name = (tire.compound ?? tire.front ?? "").toLowerCase();
  if (name.startsWith("soft")) return { letter: "S", color: "#e5373d" };
  if (name.startsWith("med")) return { letter: "M", color: "#f5c542" };
  if (name.startsWith("hard")) return { letter: "H", color: "#e8ecf1" };
  if (name.startsWith("wet")) return { letter: "W", color: "#2f7be8" };
  return name ? { letter: name[0].toUpperCase(), color: "#8b95a5" } : null;
}
