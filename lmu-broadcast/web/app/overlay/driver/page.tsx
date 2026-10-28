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

  const ord = (n: number | undefined) => (n == null ? "–" : `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`);
  const lastName = car.driver.trim().split(/\s+/).slice(-1)[0] ?? car.driver;
  const initial = car.driver.trim()[0] ?? "";
  const secs: [string, boolean, boolean][] = [
    ["S1", car.sector !== null && car.sector > 1, car.sector === 1],
    ["S2", car.sector === 3, car.sector === 2],
    ["S3", false, car.sector === 3],
  ];

  return (
    <div className="ov dc" style={{ fontSize: 16 * scale, ["--c" as string]: color }}>
      <div className="dc-top">
        <div className="dc-no ov-num">{car.num ?? "–"}</div>
        <div className="dc-sub">{classLabel(car.cls)}</div>
        {car.tire && <span style={{ fontSize: "1.2em" }}><Tires tire={car.tire} overlay /></span>}
        {car.inPits && <span className="tw-pit">BOX</span>}
        {car.yellowCause && <span className="tw-yel">GELB</span>}
        <div className="dc-name">{initial}. {lastName}</div>
      </div>
      <div className="dc-main">
        <div className="dc-pos ov-num">{ord(classPos)}</div>
        <div className="dc-time">{fmtTime(car.lapTime)}</div>
      </div>
      <div className="dc-stats ov-num">
        <span>Letzte <b>{fmtTime(car.lastLap)}</b></span>
        <span>Beste <b>{fmtTime(car.bestLap)}</b></span>
        <span><b>{Math.round(car.speedKmh)}</b> km/h</span>
      </div>
      <div className="dc-secs">
        {secs.map(([label, done, current]) => (
          <div key={label} className={`dc-sec${done ? " done" : current ? " cur" : ""}`}>
            {label}
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}
