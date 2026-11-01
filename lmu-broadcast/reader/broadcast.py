"""
Rechnet fuers Broadcast-Overlay zusaetzliche Werte in das Paket (nur im Reader, die Website rechnet nichts davon neu):

  cPos, cGapLeader, cLapsLeader, cGapAhead, cLapsAhead, cAheadId
      Klassenplatz und Abstaende innerhalb der Klasse. Rennen: sekuendlich neu.
      Training/Quali: nur neu, wenn ein Auto die Start/Ziel-Linie ueberfaehrt (Runde fertig) oder seine Bestzeit sich aendert.
  prevLap     Rundenzeit der Runde davor (zusaetzlich zu lastLap)
  splits      Durchfahrtszeiten (Session-Zeit) an S1, S2, Start/Ziel je Runde, letzte 3 Runden:
              {"12": [t1, t2, t3]}. Damit rechnet die Website den Abstand zwischen zwei BELIEBIGEN Autos je Sektor.
  bestS1/2/3  beste je gesehene Sektorzeiten des Autos (fuer lila/gruen im Tower)
"""

from __future__ import annotations

RACE_REFRESH_S = 1.0
KEEP_LAPS = 3


def _total(c: dict) -> float:
    return c["laps"] + (c.get("lapFrac") or 0.0)


class BroadcastData:
    def __init__(self):
        self._gaps: dict[int, dict] = {}  # Auto-ID -> zuletzt berechnete Klassenwerte
        self._last_calc = -1e9
        self._qual_sig = None
        self._cars: dict[int, dict] = {}  # Zustand je Auto

    # --------------------------------------------------------------
    def update(self, payload: dict, now: float) -> dict:
        cars = payload.get("cars") or []
        if payload.get("status") != "live" or not cars:
            return payload
        kind_race = int(payload["session"].get("type", 0)) >= 10
        for c in cars:
            self._track_car(c)
        self._class_gaps(cars, kind_race, now)
        for c in cars:
            st = self._cars[c["id"]]
            c["prevLap"] = st["prev"]
            c["splits"] = {str(k): v for k, v in sorted(st["splits"].items())[-2:]}
            c["bestS1"], c["bestS2"], c["bestS3"] = st["best"]
            c.update(self._gaps.get(c["id"], {"cPos": None, "cGapLeader": None, "cLapsLeader": 0, "cGapAhead": None, "cLapsAhead": 0, "cAheadId": None}))
        return payload

    # --------------------------------------------------------------
    def _track_car(self, c: dict) -> None:
        st = self._cars.setdefault(c["id"], {"laps": c["laps"], "last": c.get("lastLap"), "prev": None, "start": c.get("lapStart"),
                                              "splits": {}, "best": [None, None, None]})
        lap = c["laps"] + 1  # Runde, die gerade gefahren wird
        if c["laps"] > st["laps"]:
            # Start/Ziel ueberfahren: Runde davor ist fertig
            if c["laps"] == st["laps"] + 1:
                if st["last"] is not None:
                    st["prev"] = st["last"]
                prev_lap = c["laps"]
                if st["start"] is not None and c.get("lastLap") is not None:
                    row = st["splits"].setdefault(prev_lap, [None, None, None])
                    row[2] = round(st["start"] + c["lastLap"], 3)
            st["laps"] = c["laps"]
        elif c["laps"] < st["laps"]:
            st["laps"] = c["laps"]  # neue Session / Reset
            st["splits"].clear()
        st["last"] = c.get("lastLap") if c.get("lastLap") is not None else st["last"]
        st["start"] = c.get("lapStart")
        start = c.get("lapStart")
        if start is not None:
            row = st["splits"].setdefault(lap, [None, None, None])
            if c.get("curS1") is not None:
                row[0] = round(start + c["curS1"], 3)
                if c.get("curS2") is not None:
                    row[1] = round(start + c["curS1"] + c["curS2"], 3)
        for k in [k for k in st["splits"] if k < lap - KEEP_LAPS]:
            del st["splits"][k]
        for i, key in enumerate(("lastS1", "lastS2", "lastS3")):
            v = c.get(key)
            if v is not None and (st["best"][i] is None or v < st["best"][i]):
                st["best"][i] = v

    # --------------------------------------------------------------
    def _class_gaps(self, cars: list[dict], race: bool, now: float) -> None:
        if race:
            if now - self._last_calc < RACE_REFRESH_S and self._gaps:
                return
        else:
            sig = tuple(sorted((c["id"], c["laps"], c.get("bestLap")) for c in cars))
            if sig == self._qual_sig and self._gaps:
                return
            self._qual_sig = sig
        self._last_calc = now
        by_cls: dict[str, list[dict]] = {}
        for c in cars:
            by_cls.setdefault(c.get("cls") or "", []).append(c)
        out: dict[int, dict] = {}
        for lst in by_cls.values():
            if race:
                lst = sorted(lst, key=lambda c: c["place"])
            else:
                lst = sorted(lst, key=lambda c: (c.get("bestLap") is None, c.get("bestLap") or 0, c["place"]))
            leader = lst[0]
            for i, c in enumerate(lst):
                row = {"cPos": i + 1, "cGapLeader": None, "cLapsLeader": 0, "cGapAhead": None, "cLapsAhead": 0,
                       "cAheadId": lst[i - 1]["id"] if i else None}
                if i:
                    ahead = lst[i - 1]
                    if race:
                        row["cGapLeader"], row["cLapsLeader"] = self._race_gap(leader, c)
                        row["cGapAhead"], row["cLapsAhead"] = self._race_gap(ahead, c)
                    else:
                        if c.get("bestLap") is not None and leader.get("bestLap") is not None:
                            row["cGapLeader"] = round(c["bestLap"] - leader["bestLap"], 3)
                        if c.get("bestLap") is not None and ahead.get("bestLap") is not None:
                            row["cGapAhead"] = round(c["bestLap"] - ahead["bestLap"], 3)
                out[c["id"]] = row
        self._gaps = out

    @staticmethod
    def _race_gap(ahead: dict, behind: dict):
        """(Sekunden, Runden Rueckstand). Rueckstand >= 1 Runde: Runden statt Sekunden."""
        laps = int(_total(ahead) - _total(behind))
        if laps >= 1:
            return None, laps
        diff = (behind.get("gapLeader") or 0.0) - (ahead.get("gapLeader") or 0.0)
        return round(max(diff, 0.0), 3), 0
