import type { Car, Snapshot } from "./types";
import { classRank } from "./classes";

/** Klassenplatz: vom Reader (cPos), sonst Gesamtplatz. */
export const classPos = (c: Car) => c.cPos ?? c.place;

export function ordinal(n: number): string {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}TH`;
  return `${n}${["TH", "ST", "ND", "RD"][n % 10 < 4 ? n % 10 : 0]}`;
}

/** +1.372 oder +1 LAP / +2 LAPS (Werte kommen vom Reader). */
export function gapText(sec: number | null | undefined, laps: number | undefined): string {
  if (laps && laps > 0) return `+${laps} LAP${laps > 1 ? "S" : ""}`;
  return sec == null ? "–" : `+${sec.toFixed(3)}`;
}

export function fmtLap(s: number | null | undefined): string {
  if (s == null) return "–";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${(s - m * 60).toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

/** Laufender Rundentimer: m:ss.t */
export function fmtRun(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00.0";
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

const BRANDS: [RegExp, string][] = [
  [/ferrari/i, "FER"], [/toyota/i, "TOY"], [/cadillac/i, "CAD"], [/porsche/i, "POR"], [/bmw/i, "BMW"], [/alpine/i, "ALP"],
  [/peugeot/i, "PEU"], [/genesis/i, "GEN"], [/aston/i, "AMR"], [/lexus/i, "LEX"], [/corvette|chevrolet/i, "COR"], [/mclaren/i, "MCL"],
  [/ford|mustang/i, "FOR"], [/mercedes/i, "MER"], [/oreca/i, "ORE"], [/ligier/i, "LIG"], [/lamborghini/i, "LAM"], [/glickenhaus/i, "GLI"],
];
export function brandOf(vehicle: string): string {
  return BRANDS.find(([r]) => r.test(vehicle))?.[1] ?? "";
}

export function tla(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? name).slice(0, 3).toUpperCase();
}
export function initialName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}`.toUpperCase() : name.toUpperCase();
}

export function focusCar(snap: Snapshot, override: number | null): Car | null {
  const cars = snap.cars;
  if (override != null) { const c = cars.find((x) => x.num === override); if (c) return c; }
  const id = snap.session.focusId;
  return (id != null ? cars.find((c) => c.id === id) : undefined) ?? cars.find((c) => c.player) ?? cars[0] ?? null;
}

const sameClass = (a: Car, b: Car) => (a.cls || "") === (b.cls || "");
const classList = (cars: Car[], c: Car) => cars.filter((x) => sameClass(x, c)).sort((a, b) => classPos(a) - classPos(b));

/**
 * Zwei Autos fuer Head to Head / Onboard Battle: [vorne, hinten].
 * Auto-Wahl: das Fokus-Auto mit dem Nachbarn (Klasse) mit dem kleineren Abstand. vs=Nummer erzwingt den Gegner.
 */
export function pickPair(cars: Car[], focus: Car, vs: number | null): [Car, Car] | null {
  if (vs != null) {
    const other = cars.find((c) => c.num === vs && c.id !== focus.id);
    if (other) return classPos(other) < classPos(focus) || (other.place < focus.place && !sameClass(other, focus)) ? [other, focus] : [focus, other];
  }
  const list = classList(cars, focus);
  const i = list.findIndex((c) => c.id === focus.id);
  const ahead = list[i - 1];
  const behind = list[i + 1];
  if (ahead && behind) {
    const gAhead = focus.cGapAhead ?? Infinity;
    const gBehind = behind.cGapAhead ?? Infinity;
    return gBehind < gAhead ? [focus, behind] : [ahead, focus];
  }
  if (ahead) return [ahead, focus];
  if (behind) return [focus, behind];
  return null;
}

/** Abstand hinten zu vorne in Sekunden (vom Reader), sonst aus den Fuehrungsabstaenden. */
export function pairGap(front: Car, back: Car): number | null {
  if (back.cAheadId === front.id && back.cGapAhead != null) return back.cGapAhead;
  if (back.gapLeader != null && front.gapLeader != null) return Math.max(back.gapLeader - front.gapLeader, 0);
  return back.cGapAhead ?? null;
}

/** Abstand an S1, S2, Start/Ziel zwischen zwei beliebigen Autos (Durchfahrtszeiten vom Reader). Positiv: hinten ist spaeter. */
export function sectorDeltas(front: Car, back: Car): (number | null)[] {
  const out: (number | null)[] = [null, null, null];
  const a = front.splits ?? {};
  const b = back.splits ?? {};
  const laps = Object.keys(a).filter((k) => k in b).map(Number).sort((x, y) => y - x);
  for (let s = 0; s < 3; s++) {
    for (const lap of laps) {
      const ta = a[String(lap)]?.[s];
      const tb = b[String(lap)]?.[s];
      if (ta != null && tb != null) { out[s] = Math.round((tb - ta) * 1000) / 1000; break; }
    }
  }
  return out;
}

export type SectorState = "none" | "done" | "best" | "pb" | "now";
/** Farbe je Sektor: lila = Gesamtbestzeit, gruen = eigene Bestzeit, gelb = langsamer, "now" = laeuft gerade. */
export function sectorStates(c: Car, overall: (number | null)[]): SectorState[] {
  const cur = [c.curS1 ?? null, c.curS2 ?? null, null];
  const last = [c.lastS1 ?? null, c.lastS2 ?? null, c.lastS3 ?? null];
  const best = [c.bestS1 ?? null, c.bestS2 ?? null, c.bestS3 ?? null];
  const now = (c.sector ?? 1) - 1;
  return [0, 1, 2].map((i) => {
    if (i === now) return "now";
    const v = i < now ? cur[i] : last[i];
    if (v == null) return "none";
    if (overall[i] != null && v <= overall[i]! + 1e-6) return "best";
    if (best[i] != null && v <= best[i]! + 1e-6) return "pb";
    return "done";
  });
}

export function overallBestSectors(cars: Car[]): (number | null)[] {
  const m = (k: "bestS1" | "bestS2" | "bestS3") => cars.reduce<number | null>((a, c) => (c[k] != null && (a == null || c[k]! < a) ? c[k]! : a), null);
  return [m("bestS1"), m("bestS2"), m("bestS3")];
}

export const classOrder = (a: Car, b: Car) => classRank(a.cls) - classRank(b.cls) || a.cls.localeCompare(b.cls);
