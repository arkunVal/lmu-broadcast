"""
Streckenkarte aufnehmen
=======================
Fuer die Streckenkarte im OBS-Overlay braucht jede Strecke eine Datei mit dem Streckenverlauf.
Normalfall (automatisch): Kennt die Website die Strecke noch nicht, nimmt der Reader sie waehrend der
ersten gefahrenen Runde im Hintergrund auf und laedt sie hoch. Beim naechsten Mal ist sie sofort da.

Handbetrieb (nur Datei, ohne Internet):   py lmu_reader.py --record-track

Der Streckenverlauf entsteht aus den Positionen deines Autos (x/z-Koordinaten), sortiert nach der
Strecken-Distanz. Das Spiel liefert keine fertige Streckenzeichnung im Shared Memory.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from payload import MAX_CARS, _txt

BINS = 500
MIN_FILL = 0.97       # so viel der Strecke muss abgedeckt sein
MIN_KMH = 30.0        # nur Punkte bei Fahrt (nicht in der Box, nicht im Stand)


def track_slug(name: str) -> str:
    """Dateiname aus dem Streckennamen. Muss mit lib/tracks.ts der Website uebereinstimmen."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


class TrackRecorder:
    def __init__(self):
        self.track = ""
        self.length = 0.0
        self.bins: list[tuple[float, float] | None] = [None] * BINS
        self.done = False

    def reset(self, track: str, length: float):
        self.track = track
        self.length = length
        self.bins = [None] * BINS
        self.done = False

    @property
    def filled(self) -> float:
        return sum(1 for b in self.bins if b is not None) / BINS

    def update(self, data) -> str:
        """Verarbeitet einen Frame. Gibt einen kurzen Statustext zurueck."""
        info = data.scoring.scoringInfo
        track = _txt(info.mTrackName)
        length = float(info.mLapDist)
        count = max(0, min(int(info.mNumVehicles), MAX_CARS))
        if count == 0 or not track or length <= 0:
            return "wartet auf Spiel (Session laden, aufs Gelaende fahren)"
        if track != self.track or abs(length - self.length) > 1.0:
            self.reset(track, length)
        if self.done:
            return "fertig"

        # eigenes Auto bevorzugen; sonst jedes Auto, das gerade faehrt (nicht in der Box)
        cars = [data.scoring.vehScoringInfo[i] for i in range(count)]
        player = next((c for c in cars if c.mIsPlayer), None)
        for car in ([player] if player is not None else cars):
            vel = car.mLocalVel
            kmh = math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) * 3.6
            if not bool(car.mInPits) and kmh >= MIN_KMH:
                index = int(float(car.mLapDist) / length * BINS) % BINS
                self.bins[index] = (float(car.mPos.x), float(car.mPos.z))

        if self.filled >= MIN_FILL:
            self.done = True
        return f"{track}: {self.filled * 100:.0f} % der Strecke aufgenommen"

    def points(self) -> list[list[float]]:
        """Luecken (einzelne fehlende Stuecke) linear auffuellen, Ergebnis geordnet."""
        known = [i for i, b in enumerate(self.bins) if b is not None]
        if len(known) < 10:
            return []
        out: list[tuple[float, float]] = [(0.0, 0.0)] * BINS
        for k, i in enumerate(known):
            out[i] = self.bins[i]  # type: ignore[assignment]
            j = known[(k + 1) % len(known)]
            gap = (j - i) % BINS
            if gap > 1:
                a, b = self.bins[i], self.bins[j]  # type: ignore[misc]
                for step in range(1, gap):
                    t = step / gap
                    out[(i + step) % BINS] = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        return [[round(x, 1), round(z, 1)] for x, z in out]

    def payload(self) -> dict:
        """Fertige Aufnahme fuer den Upload auf die Website (POST /api/tracks)."""
        return {
            "name": self.track,
            "length": round(self.length, 1),
            "coverage": round(self.filled, 3),
            "points": self.points(),
        }

    def save(self, folder: Path) -> Path:
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{track_slug(self.track)}.json"
        payload = {"name": self.track, "length": round(self.length, 1), "points": self.points()}
        path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        return path
