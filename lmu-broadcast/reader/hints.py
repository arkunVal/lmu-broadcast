"""
Automatische Vorfall-Hinweise (Offtrack, Track Limits, Spin, Kontakt, Aufprall).

WICHTIG: Das sind Heuristiken. Sie sind noch NICHT gegen echte Rennen kalibriert.
Alle Schwellen stehen in config.json unter "hints". Mit `--hints-debug` druckt der
Reader jede Erkennung samt Rohwerten, damit man die Schwellen einstellen kann.
Die Rennleitung prueft jeden Hinweis am Ende von Hand.
"""

from __future__ import annotations

import json
import math
from typing import Callable

from payload import MAX_CARS, _txt, car_number

GAME_PHASE_GREEN = 5
OFF_SURFACES = (2, 3, 4)  # Gras, Dreck, Kies (mSurfaceType)

DEFAULTS = {
    "cooldown_s": 5.0,          # Sperrzeit je (Art, Auto) bzw. je Kontakt-Paar
    "lateral_margin_m": 1.0,    # Offtrack ohne Telemetrie: so weit ueber der Streckenkante
    "offtrack_min_s": 0.8,      # Mindestdauer eines Ausflugs
    "offtrack_min_kmh": 40.0,   # Mindesttempo waehrend des Ausflugs
    "offtrack_max_s": 6.0,      # laengere Ausfluege werden schon waehrenddessen gemeldet
    "slide_min_kmh": 30.0,      # Spin: Mindesttempo
    "slide_angle_deg": 35.0,    # Spin: Schlupfwinkel
    "slide_frames": 2,          # Spin: so viele neue Frames in Folge
    "contact_radius_m": 12.0,   # "anderes Auto in der Naehe"
    "impact_min": 100.0,        # Aufprall-Staerke (Einheit im Spiel unbekannt)
    "accel_spike": 80.0,        # Beschleunigungs-Spitze (m/s^2) fuer Autos ohne Telemetrie
    "accel_radius_factor": 0.6, # dabei Radius = contact_radius_m * Faktor
    "overtake_radius_m": 20.0,  # Ueberholmanoever: so nah muessen sich beide Autos beim Platztausch sein
    "overtake_min_kmh": 40.0,   # Ueberholmanoever: Mindesttempo beider Autos
}


class _CarState:
    __slots__ = (
        "off_start", "off_lap", "off_lapdist", "off_max_speed", "off_max_excess",
        "off_source", "off_conf", "off_reported",
        "slide_frames", "slide_reported",
        "last_impact", "last_steps",
    )

    def __init__(self):
        self.last_impact = None
        self.last_steps = None
        self.reset_motion()

    def reset_motion(self):
        self.off_start = None
        self.off_lap = 0
        self.off_lapdist = 0.0
        self.off_max_speed = 0.0
        self.off_max_excess = None
        self.off_source = None
        self.off_conf = "low"
        self.off_reported = False
        self.slide_frames = 0
        self.slide_reported = False


class _Car:
    __slots__ = ("id", "v", "x", "z", "speed")

    def __init__(self, v):
        self.v = v
        self.id = int(v.mID)
        self.x = float(v.mPos.x)
        self.z = float(v.mPos.z)
        vel = v.mLocalVel
        self.speed = math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) * 3.6


def _has_telemetry(tel) -> bool:
    """Fremde Autos haben im Multiplayer oft nur Nullen. Dann gilt: keine Telemetrie."""
    return tel is not None and (float(tel.mElapsedTime) > 0.0 or float(tel.mDeltaTime) > 0.0)


class HintDetector:
    def __init__(self, cfg: dict | None = None, debug: bool = False, log: Callable[[str], None] = print):
        cfg = cfg or {}
        self.cfg = dict(DEFAULTS)
        for key, value in cfg.items():
            if key in DEFAULTS:
                self.cfg[key] = type(DEFAULTS[key])(value)
            else:
                log(f"[Hinweise] Unbekannte Einstellung in config.json -> hints: '{key}' (ignoriert)")
        self.debug = debug
        self._log = log
        self._states: dict[int, _CarState] = {}
        self._cooldowns: dict[tuple, float] = {}
        self._pairs: dict[tuple, int] = {}
        self._last_et: float | None = None
        self.detected = 0

    # ------------------------------------------------------------------ API
    def update(self, data) -> list[dict]:
        info = data.scoring.scoringInfo
        et = float(info.mCurrentET)

        if self._last_et is not None:
            if et == self._last_et:
                return []  # kein neuer Spiel-Frame
            if et < self._last_et - 1e-6:
                self._states.clear()  # neue Session
                self._cooldowns.clear()
                self._pairs.clear()
        self._last_et = et

        if int(info.mGamePhase) != GREEN_PHASE():
            self._states.clear()
            self._pairs.clear()
            return []

        count = max(0, min(int(info.mNumVehicles), MAX_CARS))
        cars = [_Car(data.scoring.vehScoringInfo[i]) for i in range(count)]
        present = {c.id for c in cars}
        for stale in [i for i in self._states if i not in present]:
            del self._states[stale]

        telemetry = {}
        tcount = min(int(data.telemetry.activeVehicles), MAX_CARS)
        for i in range(tcount):
            t = data.telemetry.telemInfo[i]
            if _has_telemetry(t):
                telemetry[int(t.mID)] = t

        out: list[dict] = []
        for car in cars:
            st = self._states.setdefault(car.id, _CarState())
            tel = telemetry.get(car.id)

            if bool(car.v.mInPits) or bool(car.v.mInGarageStall):
                st.reset_motion()
                if tel is not None:  # Baseline mitfuehren, damit nichts nachtraeglich feuert
                    st.last_impact = float(tel.mLastImpactET)
                    st.last_steps = int(tel.mTrackLimitsSteps)
                continue

            self._track_limits(out, info, et, car, st, tel)
            self._offtrack(out, info, et, car, st, tel)
            self._impact(out, info, et, car, st, tel, cars)
            self._spin(out, info, et, car, st, cars)
            self._accel(out, info, et, car, tel, cars)

        self._overtakes(out, info, et, cars)

        if len(self._cooldowns) > 2000:
            cutoff = et - 3600.0
            self._cooldowns = {k: t for k, t in self._cooldowns.items() if t > cutoff}
        self.detected += len(out)
        return out

    # ----------------------------------------------------------- Detektoren
    def _track_limits(self, out, info, et, car, st, tel):
        if tel is None:
            return
        steps = int(tel.mTrackLimitsSteps)
        if st.last_steps is not None and steps > st.last_steps:
            self._emit(
                out, info, "track_limits", "high", et, int(car.v.mTotalLaps) + 1, float(car.v.mLapDist),
                [(car.v, "involved")], {"steps": steps, "previousSteps": st.last_steps},
                ("track_limits", car.id),
            )
        st.last_steps = steps

    def _offtrack(self, out, info, et, car, st, tel):
        c = self.cfg
        if tel is not None:
            surfaces = [int(w.mSurfaceType) for w in tel.mWheels]
            off = all(s in OFF_SURFACES for s in surfaces)
            source, conf, excess = "wheels", "medium", None
        else:
            excess = abs(float(car.v.mPathLateral)) - abs(float(car.v.mTrackEdge))
            off = excess > c["lateral_margin_m"]
            source, conf = "lateral", "low"

        if off:
            if st.off_start is None:
                st.off_start = et
                st.off_lap = int(car.v.mTotalLaps) + 1
                st.off_lapdist = float(car.v.mLapDist)
                st.off_max_speed = car.speed
                st.off_max_excess = excess
                st.off_source, st.off_conf = source, conf
                st.off_reported = False
            else:
                st.off_max_speed = max(st.off_max_speed, car.speed)
                if excess is not None:
                    st.off_max_excess = excess if st.off_max_excess is None else max(st.off_max_excess, excess)
                if not st.off_reported and et - st.off_start >= c["offtrack_max_s"]:
                    self._finish_offtrack(out, info, et, car, st)
        elif st.off_start is not None:
            if not st.off_reported:
                self._finish_offtrack(out, info, et, car, st)
            st.off_start = None
            st.off_reported = False
            st.off_max_excess = None

    def _finish_offtrack(self, out, info, et, car, st):
        c = self.cfg
        duration = et - st.off_start
        st.off_reported = True
        if duration < c["offtrack_min_s"] or st.off_max_speed <= c["offtrack_min_kmh"]:
            if self.debug:
                self._log(
                    f"[HINWEIS-DEBUG] t={et:.1f} offtrack verworfen: #{car.id} "
                    f"dauer={duration:.2f}s maxKmh={st.off_max_speed:.0f} quelle={st.off_source}"
                )
            return
        details = {
            "durationS": round(duration, 2),
            "maxSpeedKmh": round(st.off_max_speed, 1),
            "source": st.off_source,
        }
        if st.off_max_excess is not None:
            details["maxExcessM"] = round(st.off_max_excess, 2)
        self._emit(
            out, info, "offtrack", st.off_conf, st.off_start, st.off_lap, st.off_lapdist,
            [(car.v, "involved")], details, ("offtrack", car.id),
        )

    def _impact(self, out, info, et, car, st, tel, cars):
        if tel is None:
            return
        impact_et = float(tel.mLastImpactET)
        previous = st.last_impact
        st.last_impact = impact_et
        if previous is None or impact_et <= previous:
            return
        magnitude = float(tel.mLastImpactMagnitude)
        if magnitude < self.cfg["impact_min"]:
            if self.debug:
                self._log(
                    f"[HINWEIS-DEBUG] t={et:.1f} Aufprall unter Schwelle: #{car.id} "
                    f"staerke={magnitude:.1f} (impact_min={self.cfg['impact_min']})"
                )
            return
        near = self._near(car, cars, self.cfg["contact_radius_m"])
        if near:
            other, dist = near[0]
            self._emit(
                out, info, "contact", "medium", et, int(car.v.mTotalLaps) + 1, float(car.v.mLapDist),
                [(car.v, "involved"), (other.v, "involved")],
                {"source": "impact", "impactMagnitude": round(magnitude, 1),
                 "impactET": round(impact_et, 2), "distanceM": round(dist, 1)},
                ("contact", frozenset((car.id, other.id))),
            )
        else:
            self._emit(
                out, info, "impact", "low", et, int(car.v.mTotalLaps) + 1, float(car.v.mLapDist),
                [(car.v, "involved")],
                {"impactMagnitude": round(magnitude, 1), "impactET": round(impact_et, 2)},
                ("impact", car.id),
            )

    def _spin(self, out, info, et, car, st, cars):
        c = self.cfg
        vel = car.v.mLocalVel
        angle = math.degrees(math.atan2(abs(vel.x), max(abs(vel.z), 0.1)))
        sliding = car.speed > c["slide_min_kmh"] and angle > c["slide_angle_deg"]
        if not sliding:
            st.slide_frames = 0
            st.slide_reported = False
            return
        st.slide_frames += 1
        if st.slide_reported or st.slide_frames < c["slide_frames"]:
            return
        st.slide_reported = True
        details = {"angleDeg": round(angle, 1), "speedKmh": round(car.speed, 1)}
        near = self._near(car, cars, c["contact_radius_m"])
        lap, lapdist = int(car.v.mTotalLaps) + 1, float(car.v.mLapDist)
        if near:
            details["distanceM"] = round(near[0][1], 1)
            drivers = [(car.v, "involved")] + [(o.v, "possible") for o, _ in near[:2]]
            self._emit(
                out, info, "contact", "medium", et, lap, lapdist, drivers, details,
                ("contact", frozenset((car.id, near[0][0].id))),
            )
        else:
            self._emit(out, info, "spin", "low", et, lap, lapdist, [(car.v, "involved")], details, ("spin", car.id))

    def _accel(self, out, info, et, car, tel, cars):
        if tel is not None:
            return
        a = car.v.mLocalAccel
        accel = math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
        if accel <= self.cfg["accel_spike"]:
            return
        radius = self.cfg["contact_radius_m"] * self.cfg["accel_radius_factor"]
        near = self._near(car, cars, radius)
        if not near:
            return
        other, dist = near[0]
        self._emit(
            out, info, "contact", "low", et, int(car.v.mTotalLaps) + 1, float(car.v.mLapDist),
            [(car.v, "involved"), (other.v, "possible")],
            {"source": "accel", "accelMs2": round(accel, 1), "distanceM": round(dist, 1)},
            ("contact", frozenset((car.id, other.id))),
        )

    def _overtakes(self, out, info, et, cars):
        """Zwei nahe Autos tauschen die Reihenfolge entlang der Strecke -> Ueberholmanoever (nur zum Ansehen)."""
        length = float(info.mLapDist)
        if length < 500.0:
            return
        r = self.cfg["overtake_radius_m"]
        min_kmh = self.cfg["overtake_min_kmh"]
        active = [c for c in cars if not bool(c.v.mInPits) and not bool(c.v.mInGarageStall) and c.speed >= min_kmh]
        pairs: dict[tuple, int] = {}
        for i, a in enumerate(active):
            for b in active[i + 1:]:
                d = (float(a.v.mLapDist) - float(b.v.mLapDist) + length / 2.0) % length - length / 2.0
                if abs(d) > r or math.hypot(a.x - b.x, a.z - b.z) > r * 1.5:
                    continue
                key = (min(a.id, b.id), max(a.id, b.id))
                sign = 1 if (d > 0) == (a.id < b.id) else -1  # +1: kleinere ID liegt vorn
                if abs(d) < 0.5:
                    sign = self._pairs.get(key, sign)
                pairs[key] = sign
                old = self._pairs.get(key)
                if old is not None and old != sign:
                    front, back = (a, b) if d > 0 else (b, a)
                    self._emit(
                        out, info, "overtake", "low", et, int(front.v.mTotalLaps) + 1, float(front.v.mLapDist),
                        [(front.v, "involved"), (back.v, "involved")],
                        {"overtaker": _txt(front.v.mDriverName), "overtaken": _txt(back.v.mDriverName)},
                        ("overtake", frozenset(key)),
                    )
        self._pairs = pairs

    # -------------------------------------------------------------- Helfer
    @staticmethod
    def _near(car, cars, radius):
        found = []
        for other in cars:
            if other.id == car.id or bool(other.v.mInPits) or bool(other.v.mInGarageStall):
                continue
            dist = math.hypot(other.x - car.x, other.z - car.z)
            if dist <= radius:
                found.append((other, dist))
        found.sort(key=lambda item: item[1])
        return found

    def _emit(self, out, info, kind, confidence, session_time, lap, lap_dist, drivers, details, cool_key):
        last = self._cooldowns.get(cool_key)
        if last is not None and session_time - last < self.cfg["cooldown_s"]:
            if self.debug:
                self._log(f"[HINWEIS-DEBUG] t={session_time:.1f} {kind} unterdrueckt (Cooldown) {cool_key[1]}")
            return
        self._cooldowns[cool_key] = session_time

        ids = sorted({int(v.mID) for v, _ in drivers})
        key = (
            f"{_txt(info.mTrackName)}|{int(info.mSession)}|{int(info.mStartET)}|{kind}|"
            f"{'-'.join(str(i) for i in ids)}|{int(session_time)}"
        )
        hint = {
            "key": key,
            "kind": kind,
            "confidence": confidence,
            "sessionType": int(info.mSession),
            "sessionTime": round(float(session_time), 2),
            "lap": int(lap),
            "lapDist": round(float(lap_dist), 1),
            "drivers": [
                {
                    "name": _txt(v.mDriverName),
                    "num": car_number(_txt(v.mVehicleName)),
                    "cls": _txt(v.mVehicleClass),
                    "role": role,
                }
                for v, role in drivers
            ],
            "details": details,
        }
        out.append(hint)
        if self.debug:
            names = ", ".join(f"{d['name']}({d['role']})" for d in hint["drivers"])
            self._log(
                f"[HINWEIS-DEBUG] t={session_time:.1f} {kind} [{confidence}] Runde {hint['lap']} | {names} | "
                f"{json.dumps(details, ensure_ascii=False)}"
            )


def GREEN_PHASE() -> int:
    return GAME_PHASE_GREEN
