"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { classColor } from "@/lib/classes";
import { loadStoredTrack } from "@/lib/tracks";
import { num, useOverlayData } from "@/lib/useOverlayData";

const BINS = 500;
type Pt = [number, number] | null;

/**
 * Streckenkarte fuer OBS. Bevorzugt wird die hinterlegte Datei /tracks/<strecke>.json
 * (aufgenommen mit "py lmu_reader.py --record-track"). Gibt es keine, wird der Verlauf
 * ersatzweise aus den Positionen der Autos "gelernt" und im Browser gespeichert.
 * Optionen: room=CODE, scale=1, labels=1 (Startnummern anzeigen), debug=1
 */
export default function TrackMap() {
  const { params, snapshot, connection, debug } = useOverlayData();
  const scale = num(params, "scale", 1);
  const labels = params?.get("labels") !== "0";
  const outline = useRef<Pt[]>(Array(BINS).fill(null));
  const loadedTrack = useRef("");
  const fixed = useRef(false); // true = hinterlegte Karte, nicht mehr lernen
  const [version, setVersion] = useState(0);

  const track = snapshot?.session.track ?? "";

  useEffect(() => {
    if (!track || loadedTrack.current === track) return;
    loadedTrack.current = track;
    fixed.current = false;
    outline.current = Array(BINS).fill(null);
    loadStoredTrack(track).then((stored) => {
      if (loadedTrack.current !== track) return; // Strecke hat inzwischen gewechselt
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
    const w = 400, h = 280, pad = 18;
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

  if (!snapshot) {
    return debug ? <div className="ov" style={{ fontSize: 14 }}>Karte: keine Live-Daten ({connection})</div> : null;
  }

  return (
    <div className="ov mp" style={{ fontSize: 16 * scale }}>
      {!geom ? (
        <div className="mp-note">Streckenverlauf wird aufgezeichnet … (eine Runde fahren)</div>
      ) : (
        <svg viewBox={`0 0 ${geom.w} ${geom.h}`}>
          <path d={geom.path} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={9} strokeLinejoin="round" />
          <path d={geom.path} fill="none" stroke="rgba(255,255,255,.75)" strokeWidth={2} strokeLinejoin="round" />
          {snapshot.cars.map((c) => {
            const [px, pz] = geom.project(c.x, c.z);
            return (
              <g key={c.id}>
                <circle cx={px} cy={pz} r={c.player ? 6 : 4.5} fill={c.yellowCause ? "#f5c542" : classColor(c.cls)} stroke="#fff" strokeWidth={c.player ? 2 : 1} />
                {labels && (
                  <text x={px + 7} y={pz - 5} fontSize={9} fill="#fff" fontWeight={700}>{c.num ?? ""}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
