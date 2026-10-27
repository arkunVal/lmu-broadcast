// Muss mit track_slug() in reader/track_recorder.py uebereinstimmen.
export function trackSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export type StoredTrack = { name: string; length: number; points: [number, number][] };

/** Laedt die hinterlegte Streckenkarte, oder null wenn es keine gibt. */
export async function loadStoredTrack(name: string): Promise<StoredTrack | null> {
  const slug = trackSlug(name);
  if (!slug) return null;
  try {
    const res = await fetch(`/tracks/${slug}.json`, { cache: "force-cache" });
    if (!res.ok) return null;
    const json = (await res.json()) as StoredTrack;
    return Array.isArray(json.points) && json.points.length >= 10 ? json : null;
  } catch {
    return null;
  }
}
