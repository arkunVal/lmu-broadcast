"use client";

import { classColor, classLabel } from "@/lib/classes";
import { fmtTime } from "@/lib/format";
import Tires from "@/components/Tires";
import { buildGroups, sessionKind } from "@/lib/standings";
import { num, useOverlayData } from "@/lib/useOverlayData";

/**
 * Fahrerkarte fuer OBS.
 * Optionen: room=CODE, car=8 (Startnummer), follow=player|leader (Standard: player),
 *           scale=1, debug=1
 */
export default function DriverCard() {
  const { params, snapshot, connection, debug } = useOverlayData();
  const scale = num(params, "scale", 1);
  const carNo = params?.get("car");
  const follow = params?.get("follow") === "leader" ? "leader" : "player";

  if (!snapshot) {
    return debug ? <div className="ov" style={{ fontSize: 14 }}>Fahrerkarte: keine Live-Daten ({connection})</div> : null;
  }

  const cars = snapshot.cars;
  const kind = sessionKind(snapshot.session.type);
  let car =
    (carNo ? cars.find((c) => String(c.num) === carNo) : undefined) ??
    (follow === "leader" ? [...cars].sort((a, b) => a.place - b.place)[0] : cars.find((c) => c.player)) ??
    cars[0];
  if (!car) return null;

  const group = buildGroups(cars, kind).find((g) => g.cls === (car.cls || "–"));
  const classPos = group?.rows.find((r) => r.car.id === car.id)?.classPos;
  const color = classColor(car.cls);

  const secs: [string, number | null, boolean][] = [
    ["S1", car.lastS1, car.sector === 1],
    ["S2", car.lastS2, car.sector === 2],
    ["S3", car.lastS3, car.sector === 3],
  ];

  return (
    <div className="ov dc" style={{ fontSize: 16 * scale, ["--c" as string]: color }}>
      <div className="dc-top">
        <div className="dc-no ov-num">{car.num ?? "–"}</div>
        <div style={{ flex: 1 }}>
          <div className="dc-name">{car.driver}</div>
          <div className="dc-sub">
            {classLabel(car.cls)} · P{classPos ?? "–"} in Klasse · {car.vehicle}
          </div>
        </div>
        {car.tire && <span style={{ fontSize: "1.3em" }}><Tires tire={car.tire} overlay /></span>}
        {car.inPits && <span className="tw-pit">BOX</span>}
        {car.yellowCause && <span className="tw-yel">GELB</span>}
      </div>
      <div className="dc-main">
        <div>
          <div className="dc-big ov-num">{Math.round(car.speedKmh)}</div>
          <div className="dc-lbl">km/h</div>
        </div>
        <div>
          <div className="dc-big ov-num">{fmtTime(car.lapTime)}</div>
          <div className="dc-lbl">aktuelle Runde · Runde {car.laps + 1}</div>
        </div>
        <div>
          <b className="ov-num">{fmtTime(car.lastLap)}</b>
          <div className="dc-lbl">letzte Runde</div>
        </div>
        <div>
          <b className="ov-num">{fmtTime(car.bestLap)}</b>
          <div className="dc-lbl">beste Runde</div>
        </div>
      </div>
      <div className="dc-secs">
        {secs.map(([label, value, current]) => (
          <div key={label} className={`dc-sec${current ? " cur" : ""}`}>
            <div className="dc-lbl">{label}</div>
            <b className="ov-num">{fmtTime(value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
