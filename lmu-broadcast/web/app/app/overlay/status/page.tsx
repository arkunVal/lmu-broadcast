"use client";

import { fmtClock, phaseName } from "@/lib/format";
import { sessionLabel, shortName } from "@/lib/standings";
import { num, useOverlayData } from "@/lib/useOverlayData";

/**
 * Status-Leiste fuer OBS: Flaggen (Gelb, Full Course Yellow), Gelb-Ausloeser, Boxen-Zaehler.
 * Optionen: room=CODE, scale=1, always=1 (auch bei Gruen anzeigen), debug=1
 */
export default function Status() {
  const { params, snapshot, connection, debug } = useOverlayData();
  const scale = num(params, "scale", 1);
  const always = params?.get("always") === "1";

  if (!snapshot) {
    return debug ? <div className="ov" style={{ fontSize: 14 }}>Status: keine Live-Daten ({connection})</div> : null;
  }

  const s = snapshot.session;
  const causes = snapshot.cars.filter((c) => c.yellowCause);
  const inPits = snapshot.cars.filter((c) => c.inPits).length;
  const fcy = s.phase === 6;
  const localYellow = s.sectorFlags.some(Boolean);
  const red = s.phase === 7;

  let kind = "";
  let title = "";
  if (red) { kind = "red"; title = "SESSION GESTOPPT"; }
  else if (fcy) { kind = "fcy"; title = "FULL COURSE YELLOW"; }
  else if (localYellow) { kind = "yellow"; title = "GELB"; }

  if (!kind && !always) return null;

  return (
    <div className="ov st" style={{ fontSize: 16 * scale }}>
      <div className={`st-bar ${kind}`}>
        <span>{title || "GRÜN"}</span>
        <span className="st-sub">
          {localYellow && !fcy && !red
            ? `Sektor ${s.sectorFlags.map((f, i) => (f ? i + 1 : null)).filter(Boolean).join(", ")}`
            : phaseName(s.phase)}
        </span>
      </div>
      {causes.length > 0 && (
        <div className="st-info">
          {causes.map((c) => (
            <span key={c.id}>
              ⚠ #{c.num ?? "–"} {shortName(c.driver, "short")} steht auf der Strecke
            </span>
          ))}
        </div>
      )}
      <div className="st-info">
        <span>{sessionLabel(s.type)}</span>
        <span>Restzeit {fmtClock(s.remaining)}</span>
        <span>In der Box: {inPits}</span>
      </div>
    </div>
  );
}
