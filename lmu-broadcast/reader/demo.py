"""
Demo-Modus: erzeugt Fake-Rennen-Daten im selben Format wie der echte Reader.
Damit kannst du die Website testen, ohne dass Le Mans Ultimate laeuft.
"""

from __future__ import annotations

import math
import time

from payload import PAYLOAD_VERSION

TRACK_LENGTH = 13626.0  # ungefaehr Le Mans
LAP_TIME = 205.0

_DRIVERS = [
    ("Max Becker", "Hypercar", "Toyota GR010 #8", "Medium"),
    ("Lena Vogt", "Hypercar", "Ferrari 499P #50", "Soft"),
    ("Tim Aebi", "Hypercar", "Porsche 963 #6", "Medium"),
    ("Jonas Roth", "Hypercar", "Cadillac V-Series.R #2", "Hard"),
    ("Sara Klein", "LMP2", "Oreca 07 #28", "Medium"),
    ("Paul Wirth", "LMP2", "Oreca 07 #34", "Soft"),
    ("Anna Lorenz", "GT3", "Corvette Z06 GT3.R #33", "Medium"),
    ("Felix Brandt", "GT3", "BMW M4 GT3 #31", "Hard"),
]


def demo_payload(start_time: float) -> dict:
    now = time.time()
    t = now - start_time
    cars = []

    for i, (driver, cls, vehicle, compound) in enumerate(_DRIVERS):
        speed_factor = 1.0 - i * 0.012
        dist_total = (t * (TRACK_LENGTH / LAP_TIME) * speed_factor + (len(_DRIVERS) - i) * 120.0)
        lap_dist = dist_total % TRACK_LENGTH
        laps = int(dist_total // TRACK_LENGTH)
        frac = lap_dist / TRACK_LENGTH

        speed = 190.0 + 90.0 * math.sin(frac * math.pi * 12 + i)
        in_pits = (i == 3) and (int(t) % 60 > 45)  # Auto 4 faehrt regelmaessig in die Box
        stopped = (i == 6) and (int(t) % 80 > 60)  # Auto 7 steht zeitweise (Gelb-Ausloeser)
        if in_pits:
            speed = 60.0
        if stopped:
            speed = 0.0

        angle = frac * 2 * math.pi
        sector = 1 if frac < 0.33 else 2 if frac < 0.66 else 3
        lap_time = frac * LAP_TIME / speed_factor
        base_lap = LAP_TIME / speed_factor

        cars.append(
            {
                "id": i,
                "num": int(vehicle.split("#")[1]),
                "driver": driver,
                "vehicle": vehicle,
                "cls": cls,
                "place": i + 1,
                "player": i == 0,
                "control": 2,
                "speedKmh": round(speed, 1),
                "lapDist": round(lap_dist, 1),
                "lapFrac": round(frac, 4),
                "x": round(math.cos(angle) * 1500.0, 1),
                "z": round(math.sin(angle) * 900.0, 1),
                "laps": laps,
                "sector": sector,
                "lapTime": round(lap_time, 3),
                "lastLap": round(base_lap + 0.4 * math.sin(i), 3) if laps > 0 else None,
                "bestLap": round(base_lap - 0.8, 3) if laps > 0 else None,
                "lastS1": round(base_lap * 0.31, 3) if laps > 0 else None,
                "lastS2": round(base_lap * 0.36, 3) if laps > 0 else None,
                "lastS3": round(base_lap * 0.33, 3) if laps > 0 else None,
                "curS1": round(base_lap * 0.31, 3) if sector > 1 else None,
                "curS2": round(base_lap * 0.36, 3) if sector > 2 else None,
                "gapNext": None if i == 0 else round(1.5 + i * 0.7, 3),
                "gapLeader": None if i == 0 else round(i * 3.2, 3),
                "inPits": in_pits,
                "pitState": 2 if in_pits else 0,
                "pitStops": laps // 25,
                "penalties": 0,
                "underFcy": False,
                "yellowCause": stopped,
                "finish": 0,
                "tire": {"front": compound, "rear": compound, "compound": compound},
            }
        )

    any_yellow = any(c["yellowCause"] for c in cars)
    return {
        "v": PAYLOAD_VERSION,
        "t": int(now * 1000),
        "status": "live",
        "demo": True,
        "session": {
            "track": "Demo Circuit",
            "type": 10,
            "phase": 5,
            "yellowState": 0,
            "sectorFlags": [0, 0, 1] if any_yellow else [0, 0, 0],
            "time": round(t, 1),
            "endTime": 21600.0,
            "remaining": round(21600.0 - t, 1),
            "maxLaps": 0,
            "trackLength": TRACK_LENGTH,
            "rain": 0.0,
            "trackTemp": 31.0,
            "airTemp": 22.0,
            "cars": len(cars),
        },
        "cars": cars,
    }


def demo_hint(payload: dict) -> dict:
    """Fake-Vorfall-Hinweis fuer Tests der Rennleitungs-Kette (--demo-hints)."""
    car = payload["cars"][6]
    t = payload["session"]["time"]
    return {
        "key": f"demo|{int(payload['t'])}",
        "kind": "offtrack",
        "confidence": "low",
        "sessionType": payload["session"]["type"],
        "sessionTime": t,
        "lap": car["laps"] + 1,
        "lapDist": car["lapDist"],
        "drivers": [{"name": car["driver"], "num": car["num"], "cls": car["cls"], "role": "involved"}],
        "details": {"durationS": 2.1, "maxSpeedKmh": 148.0, "source": "demo"},
    }
