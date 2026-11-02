"""Welches Auto schaut man im Spiel gerade an? (nicht unbedingt das eigene)

Quellen, in dieser Reihenfolge:
  1. Spiel-REST (GET /rest/watch/standings oder /rest/watch/focus): Eintrag mit Markierung "focus"
  2. letzter Kamerawechsel ueber die Website (Klick in Live Timings)
  3. Shared Memory (playerVehicleIdx): das eigene Auto
"""
import json
import threading
import time

from replay_control import _game_request

PATHS = ("/rest/watch/standings", "/rest/watch/focus")
FLAGS = ("focus", "focused", "isfocus", "isfocused", "watched", "viewed", "spectated", "selected", "isselected")
SLOTS = ("slotid", "slot", "id", "vehicleid", "vehicleslot")
NAMES = ("drivername", "name", "driver")


def _flag_true(row: dict) -> bool:
    return any(str(k).lower() in FLAGS and v is True for k, v in row.items())


def parse_focus(text: str, cars: list[dict]):
    """Aus der REST-Antwort die Slot-ID (= mID) des angeschauten Autos lesen. None, wenn nicht erkennbar."""
    try:
        data = json.loads(text)
    except ValueError:
        return None
    ids = {c["id"] for c in cars if c.get("id") is not None}
    rows = data if isinstance(data, list) else [data] if isinstance(data, dict) else []
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list):
                rows = v
                break
    for row in rows:
        if not isinstance(row, dict):
            continue
        if _flag_true(row):
            low = {str(k).lower(): v for k, v in row.items()}
            for key in SLOTS:
                if isinstance(low.get(key), int) and low[key] in ids:
                    return low[key]
            for key in NAMES:
                name = str(low.get(key, "")).strip().lower()
                for c in cars:
                    if name and str(c.get("driver", "")).strip().lower() == name:
                        return c["id"]
    if isinstance(data, dict):   # /watch/focus liefert evtl. nur {"slotID": 5}
        low = {str(k).lower(): v for k, v in data.items()}
        for key in SLOTS:
            if isinstance(low.get(key), int) and low[key] in ids:
                return low[key]
    if isinstance(data, int) and data in ids:
        return data
    return None


class FocusTracker:
    def __init__(self, poll_s: float = 1.0, request=_game_request):
        self._req = request
        self._poll = poll_s
        self._cars: list[dict] = []
        self._rest: tuple[int, float] | None = None
        self._cmd: int | None = None
        self._path_ok: str | None = None
        self._fails = 0
        self._last_src = ""
        self._stop = False

    def start(self):
        threading.Thread(target=self._loop, daemon=True).start()

    def stop(self):
        self._stop = True

    def note_command(self, car_id):
        """Die Website hat die Kamera auf ein Auto gestellt (None = unbekannt, z. B. 'naechstes Auto')."""
        self._cmd = car_id
        if car_id is not None:
            self._rest = None

    def _loop(self):
        while not self._stop:
            try:
                for path in ([self._path_ok] if self._path_ok else PATHS):
                    status, text = self._req("GET", path, None, 2.0)
                    if status == 200:
                        slot = parse_focus(text, self._cars)
                        if slot is not None:
                            self._path_ok = path
                            self._rest = (slot, time.time())
                            self._fails = 0
                            break
                else:
                    self._fails += 1
            except Exception:
                self._fails += 1
            time.sleep(self._poll if self._fails < 5 else 10.0)

    def apply(self, payload: dict) -> None:
        """Setzt session.focusId / focusSrc im Paket."""
        self._cars = payload.get("cars", [])
        s = payload.get("session", {})
        ids = {c.get("id") for c in self._cars}
        src, fid = "memory", s.get("focusId")
        if self._rest and time.time() - self._rest[1] < 5 and self._rest[0] in ids:
            src, fid = "game", self._rest[0]
        elif self._cmd in ids:
            src, fid = "command", self._cmd
        s["focusId"], s["focusSrc"] = fid, src
        if src != self._last_src:
            self._last_src = src
            print(f"[Fokus] Quelle: {src} (game = vom Spiel gemeldet, command = per Website gewaehlt, memory = eigenes Auto)")
