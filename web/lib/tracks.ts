// Muss mit track_slug() in reader/track_recorder.py uebereinstimmen.
export function trackSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export type StoredTrack = { name: string; length: number; points: [number, number][] };

async function fetchJson(url: string): Promise<StoredTrack | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const json = (await res.json()) as StoredTrack;
    return Array.isArray(json.points) && json.points.length >= 10 ? json : null;
  } catch {
    return null;
  }
}

/**
 * Laedt die gespeicherte Streckenkarte (von der Datenbank, vom Reader automatisch aufgenommen).
 * Ersatzweise eine mitgelieferte Datei unter /tracks/<slug>.json. null = noch keine Karte.
 */
export async function loadStoredTrack(name: string): Promise<StoredTrack | null> {
  const slug = trackSlug(name);
  if (!slug) return null;
  return (await fetchJson(`/api/tracks/${slug}`)) ?? (await fetchJson(`/tracks/${slug}.json`));
}
