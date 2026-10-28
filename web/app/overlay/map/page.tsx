"use client";

import TrackMap from "@/components/TrackMap";
import { num, useOverlayData } from "@/lib/useOverlayData";

/** Streckenkarte für OBS. Optionen: room=CODE, scale=1, labels=0 (Startnummern aus), debug=1 */
export default function MapOverlay() {
  const { params, snapshot, connection, debug } = useOverlayData();
  const scale = num(params, "scale", 1);
  const labels = params?.get("labels") !== "0";
  if (!snapshot) {
    return debug ? <div className="ov" style={{ fontSize: 14 }}>Karte: keine Live-Daten ({connection})</div> : null;
  }
  return (
    <div style={{ fontSize: 16 * scale }}>
      <TrackMap snapshot={snapshot} labels={labels} />
    </div>
  );
}
