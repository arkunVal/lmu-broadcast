"""
Wandelt die rohen Shared-Memory-Daten von Le Mans Ultimate in ein kompaktes,
JSON-taugliches Paket um, das an die Website geschickt wird.

Alle Fahrzeuge der Session stammen aus dem "Scoring"-Block (Position, Tempo,
Rundenzeiten, Box-Status ...). Reifen kommen aus dem "Telemetry"-Block, der
fuer fremde Autos im Multiplayer unvollstaendig sein kann (dann ist tire = None).
"""

from __future__ import annotations

import math
import re
import time

from pylmu.lmu_data import LMUConstants

MAX_CARS = LMUConstants.MAX_MAPPED_VEHICLES
PAYLOAD_VERSION = 1

_NUMBER_RE = re.compile(r"#\s*(\d{1,3})")
_COMPOUNDS = {0: "Soft", 1: "Medium", 2: "Hard", 3: "Wet"}
# mSector des Spiels: 0 = Sektor 3, 1 = Sektor 1, 2 = Sektor 2
_SECTOR_MAP = {1: 1, 2: 2, 0: 3}

# Heuristik fuer "loest Gelb aus": lokale Gelbe Flagge aktiv, Auto auf der Strecke
# (nicht in der Box) und praktisch stehend.
YELLOW_CAUSE_SPEED_KMH = 30.0
GAME_PHASE_GREEN = 5


def _txt(value) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace").strip("\x00").strip()
    return str(value)


def _signed_byte(value) -> int:
    """c_char-Felder kommen als bytes zurueck; -1 wird als b'\\xff' geliefert."""
    if isinstance(value, bytes):
        raw = value[0] if value else 0
        return raw - 256 if raw > 127 else raw
    return int(value)


def _time(value: float):
    """Zeiten <= 0 (Spiel liefert -1 = 'noch keine') werden zu None."""
    if value is None or not (0.0 < value < 36000.0):
        return None
    return round(value, 3)


def _diff(a: float, b: float):
    """Differenz zweier kumulativer Zeiten (z. B. Sektor 2 = S1+S2 minus S1)."""
    if 0.0 < a < 36000.0 and 0.0 < b < 36000.0 and a > b:
        return round(a - b, 3)
    return None


def car_number(vehicle_name: str):
    """Versucht die Startnummer aus dem Fahrzeugnamen zu lesen, z. B. 'Team #8'.

    Das Spiel hat kein eigenes Nummernfeld im Scoring-Block. Ob der Name bei
    allen Autos eine '#nummer' enthaelt, muss mit echten Daten geprueft werden.
    """
    match = _NUMBER_RE.search(vehicle_name)
    return int(match.group(1)) if match else None


def _tires_by_id(telemetry) -> dict:
    tires = {}
    count = min(int(telemetry.activeVehicles), MAX_CARS)
    for i in range(count):
        t = telemetry.telemInfo[i]
        front = _txt(t.mFrontTireCompoundName)
        rear = _txt(t.mRearTireCompoundName)
        if not (front or rear):
            continue
        tires[int(t.mID)] = {
            "front": front,
            "rear": rear,
            "compound": _COMPOUNDS.get(int(t.mWheels[0].mCompoundType)),
        }
    return tires


def build_payload(data, now_ms: int | None = None) -> dict:
    """data: LMUObjectOut (Snapshot des Shared Memory)."""
    info = data.scoring.scoringInfo
    count = max(0, min(int(info.mNumVehicles), MAX_CARS))
    now_ms = int(time.time() * 1000) if now_ms is None else now_ms

    sector_flags = [int(f) for f in info.mSectorFlag]
    phase = int(info.mGamePhase)
    local_yellow = any(sector_flags)
    track_len = float(info.mLapDist)

    session = {
        "track": _txt(info.mTrackName),
        "type": int(info.mSession),
        "phase": phase,
        "yellowState": _signed_byte(info.mYellowFlagState),
        "sectorFlags": sector_flags,
        "time": round(float(info.mCurrentET), 1),
        "endTime": round(float(info.mEndET), 1),
        "remaining": round(float(info.mSessionTimeRemaining), 1),
        "maxLaps": int(info.mMaxLaps),
        "trackLength": round(track_len, 1),
        "rain": round(float(info.mRaining), 2),
        "trackTemp": round(float(info.mTrackTemp), 1),
        "airTemp": round(float(info.mAmbientTemp), 1),
        "cars": count,
    }

    if count == 0:
        return {"v": PAYLOAD_VERSION, "t": now_ms, "status": "idle", "session": session, "cars": []}

    tires = _tires_by_id(data.telemetry)
    cars = []
    for i in range(count):
        v = data.scoring.vehScoringInfo[i]
        vel = v.mLocalVel
        speed_kmh = math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) * 3.6
        vehicle = _txt(v.mVehicleName)
        in_pits = bool(v.mInPits)

        yellow_cause = (
            local_yellow
            and phase == GAME_PHASE_GREEN
            and not in_pits
            and not bool(v.mInGarageStall)
            and int(v.mFinishStatus) == 0
            and speed_kmh < YELLOW_CAUSE_SPEED_KMH
        )

        cars.append(
            {
                "id": int(v.mID),
                "num": car_number(vehicle),
                "driver": _txt(v.mDriverName),
                "vehicle": vehicle,
                "cls": _txt(v.mVehicleClass),
                "place": int(v.mPlace),
                "player": bool(v.mIsPlayer),
                "control": int(v.mControl),
                "speedKmh": round(speed_kmh, 1),
                "lapDist": round(float(v.mLapDist), 1),
                "lapFrac": round(float(v.mLapDist) / track_len, 4) if track_len > 0 else None,
                "x": round(float(v.mPos.x), 1),
                "z": round(float(v.mPos.z), 1),
                "laps": int(v.mTotalLaps),
                "sector": _SECTOR_MAP.get(int(v.mSector)),
                "lapTime": _time(v.mTimeIntoLap),
                "lastLap": _time(v.mLastLapTime),
                "bestLap": _time(v.mBestLapTime),
                "lastS1": _time(v.mLastSector1),
                "lastS2": _diff(v.mLastSector2, v.mLastSector1),
                "lastS3": _diff(v.mLastLapTime, v.mLastSector2),
                "curS1": _time(v.mCurSector1),
                "curS2": _diff(v.mCurSector2, v.mCurSector1),
                "gapNext": _time(v.mTimeBehindNext),
                "gapLeader": _time(v.mTimeBehindLeader),
                "inPits": in_pits,
                "pitState": int(v.mPitState),
                "pitStops": int(v.mNumPitstops),
                "penalties": int(v.mNumPenalties),
                "underFcy": bool(v.mUnderYellow),
                "yellowCause": bool(yellow_cause),
                "finish": int(v.mFinishStatus),
                "tire": tires.get(int(v.mID)),
            }
        )

    return {"v": PAYLOAD_VERSION, "t": now_ms, "status": "live", "session": session, "cars": cars}
