"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { classColor } from "@/lib/classes";
import { shortName } from "@/lib/standings";
import { loadStoredTrack } from "@/lib/tracks";
import type { Snapshot } from "@/lib/types";

const BINS = 500;
type Pt = [number, number] | null;

/**
 * Streckenkarte mit allen Autos. Nimmt die gespeicherte Karte (vom Reader aufgenommen);
 * gibt es keine, wird der Verlauf ersatzweise aus den Autopositionen gelernt.
 * Autos, die Gelb auslösen, werden gelb markiert (pulsierender Ring, Nummer, Hinweiszeile).
 */
export default function TrackMap({
  snapshot,
  labels = true,
  panel = false,
}: {
  snapshot: Snapshot | null;
  labels?: boolean;
  /** true = große Karte auf der Live-Seite, false = Overlay für OBS */
  panel?: boolean;
}) {
  const outline = useRef<Pt[]>(Array(BINS).fill(null));
  const loadedTrack = useRef("");
  const fixed = useRef(false);
  const [version, setVersion] = useState(0);
  const track = snapshot?.session.track ?? "";

  useEffect(() => {
    if (!track || loadedTrack.current === track) return;
    loadedTrack.current = track;
    fixed.current = false;
    outline.current = Array(BINS).fill(null);
    loadStoredTrack(track).then((stored) => {
      if (loadedTrack.current !== track) return;
      if (stored) {
        const step = stored.points.length / BINS;
        outline.current = Array.from({ length: BINS }, (_, i) => stored.points[Math.floor(i * step)] ?? null);
        fixed.current = true;
      } else {
        try {
          const saved = localStorage.getItem(`lmu-map-${track}`);
          if (saved) outline.current = JSON.parse(saved);
        } catch {}
      }
      setVersion((v) => v + 1);
    });
  }, [track]);

  useEffect(() => {
    if (!snapshot || fixed.current) return;
    let changed = false;
    for (const c of snapshot.cars) {
      if (c.lapFrac == null || c.inPits || c.speedKmh < 40) continue;
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor(c.lapFrac * BINS)));
      if (!outline.current[bin]) {
        outline.current[bin] = [c.x, c.z];
        changed = true;
      }
    }
    if (changed) {
      setVersion((v) => v + 1);
      try {
        localStorage.setItem(`lmu-map-${loadedTrack.current}`, JSON.stringify(outline.current));
      } catch {}
    }
  }, [snapshot]);

  const geom = useMemo(() => {
    const pts = outline.current.filter((p): p is [number, number] => p !== null);
    if (pts.length < 10) return null;
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const w = 400, h = 300, pad = 22;
    const k = Math.min((w - 2 * pad) / (maxX - minX || 1), (h - 2 * pad) / (maxZ - minZ || 1));
    const offX = (w - (maxX - minX) * k) / 2;
    const offZ = (h - (maxZ - minZ) * k) / 2;
    const project = (x: number, z: number): [number, number] => [offX + (x - minX) * k, offZ + (maxZ - z) * k];
    const path = pts.map((p, i) => {
      const [px, pz] = project(p[0], p[1]);
      return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${pz.toFixed(1)}`;
    }).join(" ") + " Z";
    return { w, h, path, project };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const cars = snapshot?.cars ?? [];
  const yellows = cars.filter((c) => c.yellowCause);
  const ordered = [...cars].sort((a, b) => Number(a.yellowCause) - Number(b.yellowCause)); // Gelb zuletzt = oben

  return (
    <div className={panel ? "mpanel" : "ov mp"}>
      {panel && yellows.length > 0 && (
        <div className="mp-yellow">
          GELB: {yellows.map((c) => `#${c.num ?? "–"} ${shortName(c.driver, "short")}`).join(", ")}
        </div>
      )}
      {!snapshot ? (
        <div className="mp-note">Keine Live-Daten</div>
      ) : !geom ? (
        <div className="mp-note">Streckenverlauf wird aufgezeichnet … (eine Runde fahren)</div>
      ) : (
        <svg viewBox={`0 0 ${geom.w} ${geom.h}`}>
          <path d={geom.path} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={10} strokeLinejoin="round" />
          <path d={geom.path} fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={2} strokeLinejoin="round" />
          {ordered.map((c) => {
            const [px, pz] = geom.project(c.x, c.z);
            return (
              <g key={c.id}>
                {c.yellowCause && (
                  <>
                    <circle className="mp-ring" cx={px} cy={pz} r={9} fill="none" stroke="#fffc40" strokeWidth={2.5} />
                    <circle className="mp-ring r2" cx={px} cy={pz} r={9} fill="none" stroke="#fffc40" strokeWidth={1.5} />
                  </>
                )}
                <circle cx={px} cy={pz} r={c.yellowCause ? 6.5 : c.player ? 6 : 4.5} fill={c.yellowCause ? "#fffc40" : classColor(c.cls)} stroke={c.yellowCause ? "#000" : "#fff"} strokeWidth={c.player || c.yellowCause ? 2 : 1} />
                {(labels || c.yellowCause) && (
                  <text x={px + 9} y={pz - 7} fontSize={c.yellowCause ? 11 : 9} fill={c.yellowCause ? "#fffc40" : "#fff"} fontWeight={800} paintOrder="stroke" stroke="#000" strokeWidth={2.5}>
                    {c.num ?? ""}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
