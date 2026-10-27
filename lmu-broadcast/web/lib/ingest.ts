// Prueft und wandelt die Hinweise des Readers (POST /api/ingest) in Datenbankzeilen um.

export const HINT_KINDS = ["offtrack", "track_limits", "contact", "spin", "impact"] as const;
const CONFIDENCE = ["low", "medium", "high"] as const;
const ROLES = ["involved", "possible"] as const;

export type CleanHint = {
  key: string;
  kind: (typeof HINT_KINDS)[number];
  confidence: (typeof CONFIDENCE)[number];
  sessionType: number | null;
  sessionTime: number | null;
  lap: number | null;
  lapDist: number | null;
  drivers: { name: string; num: number | null; role: (typeof ROLES)[number] }[];
  details: Record<string, unknown>;
};

const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function cleanHints(body: unknown): { hints: CleanHint[]; error?: string } {
  const list = (body as { hints?: unknown })?.hints;
  if (!Array.isArray(list)) return { hints: [], error: "hints fehlt" };
  if (list.length === 0) return { hints: [] };
  if (list.length > 50) return { hints: [], error: "zu viele Hinweise (max. 50)" };

  const out: CleanHint[] = [];
  for (const raw of list) {
    const h = raw as Record<string, unknown>;
    const key = str(h.key, 200);
    const kind = HINT_KINDS.find((k) => k === h.kind);
    if (!key || !kind) return { hints: [], error: "ungueltiger Hinweis (key/kind)" };
    const confidence = CONFIDENCE.find((c) => c === h.confidence) ?? "low";
    const drivers = (Array.isArray(h.drivers) ? h.drivers : [])
      .slice(0, 6)
      .map((d: Record<string, unknown>) => ({
        name: str(d?.name, 64),
        num: num(d?.num),
        role: ROLES.find((r) => r === d?.role) ?? "involved",
      }))
      .filter((d) => d.name);
    let details: Record<string, unknown> = {};
    if (h.details && typeof h.details === "object" && !Array.isArray(h.details)) {
      const json = JSON.stringify(h.details);
      if (json.length <= 2000) details = h.details as Record<string, unknown>;
    }
    out.push({
      key,
      kind,
      confidence,
      sessionType: num(h.sessionType),
      sessionTime: num(h.sessionTime),
      lap: num(h.lap),
      lapDist: num(h.lapDist),
      drivers,
      details,
    });
  }
  return { hints: out };
}

export function describe(h: CleanHint): string {
  const who = h.drivers.map((d) => `${d.num != null ? `#${d.num} ` : ""}${d.name}`).join(" / ");
  const labels: Record<string, string> = {
    offtrack: "Streckenverlassen erkannt",
    track_limits: "Track-Limits-Verstoss (vom Spiel gezaehlt)",
    contact: "Moeglicher Kontakt erkannt",
    spin: "Dreher erkannt",
    impact: "Aufprall erkannt",
  };
  return `${labels[h.kind]}${who ? `: ${who}` : ""}. Automatischer Hinweis, bitte pruefen.`;
}
