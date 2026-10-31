"use client";

import TrackMap from "@/components/TrackMap";
import { useLive } from "@/lib/liveContext";

/** Streckenkarte über die ganze Fläche. */
export default function MapTab() {
  const { snapshot, live } = useLive();
  return (
    <div className="bigmap">
      <TrackMap snapshot={live ? snapshot : null} panel />
    </div>
  );
}
