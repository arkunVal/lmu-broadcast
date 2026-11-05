import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streckenkarte lesen (oeffentlich, die OBS-Overlays laufen ohne Login).
 * ?meta=1 liefert nur Name/Laenge/Abdeckung ohne die Punkte (fuer die Abfrage des Readers).
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server nicht konfiguriert" }, { status: 500 });
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json({ error: "Ungueltiger Name" }, { status: 400 });

  const meta = new URL(req.url).searchParams.get("meta") === "1";
  const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db
    .from("tracks")
    .select(meta ? "slug, name, length, coverage" : "slug, name, length, coverage, points")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Datenbankfehler" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Unbekannte Strecke" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": meta ? "no-store" : "public, s-maxage=300, stale-while-revalidate=3600" } });
}
