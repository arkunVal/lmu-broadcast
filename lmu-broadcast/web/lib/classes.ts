// Klassen-Erkennung. Die genauen Klassennamen aus dem Spiel sind noch nicht
// mit echten Daten bestaetigt, deshalb wird per "enthaelt" verglichen.
export function classRank(cls: string): number {
  const c = cls.toLowerCase();
  if (c.includes("hyper")) return 0;
  if (c.includes("lmp2")) return 1;
  if (c.includes("lmp3")) return 2;
  if (c.includes("gt3")) return 3;
  if (c.includes("gte")) return 4;
  return 9;
}

export function classColor(cls: string): string {
  switch (classRank(cls)) {
    case 0: return "#e5373d";
    case 1: return "#2f7be8";
    case 2: return "#9a63e0";
    case 3: return "#2fb36c";
    case 4: return "#f08a24";
    default: return "#8b95a5";
  }
}

export function classLabel(cls: string): string {
  switch (classRank(cls)) {
    case 0: return "HYPERCAR";
    case 1: return "LMP2";
    case 2: return "LMP3";
    case 3: return "GT3";
    case 4: return "GTE";
    default: return cls.toUpperCase() || "–";
  }
}
