"""
Spiel-Befehle ueber die LOKALE Schnittstelle von Le Mans Ultimate
=================================================================
Nur http://127.0.0.1:6397 auf dem eigenen PC (laeuft mit dem Spiel). Kein Steam-Login, kein Token, kein Server
von Studio 397. Studio 397 hat bestaetigt: Lokales ist erlaubt, solange nichts an deren Dienste (RaceControl)
geschickt wird. Alle Aufrufe sind selten: Befehle nur auf Knopfdruck, der Zustand (Fokus/Replay) alle paar Sekunden.

Ausschalten: in config.json "game_rest": false.

Ablauf pro Befehl der Website (GET {site_url}/api/commands, Ergebnis per POST zurueck):
  jump : Replay oeffnen (falls noetig) -> an die Zeit springen -> Auto waehlen -> ERST DANN Kamera "Swingarm"
  focus: Auto waehlen   live: Replay verlassen   next/prev: naechstes/vorheriges Auto
Welcher Endpunkt zum Springen/Kamera taugt, ist nicht offiziell dokumentiert. Der Reader sucht ihn im Swagger-Schema
des Spiels. Falls er falsch liegt: `py lmu_reader.py --game-endpoints` zeigt alles, dann in config.json eintragen:
  "replay_jump":   {"path": "/rest/replay/seek", "method": "POST", "param": "time", "where": "query", "scale": 1}
  "replay_camera": {"path": "/rest/replay/camera", "method": "PUT", "param": "name", "where": "query", "value": "Swingarm"}
  where: query | body | path.  scale: Faktor auf Sekunden (1000 fuer Millisekunden).
"""

from __future__ import annotations

import http.client
import json
import re
import threading
import time
from urllib.parse import quote, urlparse

GAME_HOST = "127.0.0.1"
GAME_PORT = 6397
POLL_S = 1.5            # Befehle bei der Website abholen
STATE_POLL_S = 3.0      # Fokus/Replay-Zustand beim Spiel abfragen

JUMP_WORDS = ("seek", "jump", "goto", "scrub", "time", "position", "playback")
TIME_PARAMS = ("time", "seconds", "sec", "position", "pos", "et", "timestamp", "elapsed")
CAMERA_SKIP = ("garage", "setup", "pitstop", "strategy", "weather", "hud", "standings", "focus")
FOCUS_KEYS = ("focus", "focused", "isfocus", "isfocused", "watched", "viewed", "isviewed", "iswatched")
ID_KEYS = ("slotid", "slotID", "id", "mID", "slot")


# --- Spiel-Aufruf ---------------------------------------------------------------------------
def game_request(method: str, path: str, body=None, timeout: float = 2.0) -> tuple[int, str]:
    """(Status, Text). Status 0 = nicht erreichbar."""
    try:
        conn = http.client.HTTPConnection(GAME_HOST, GAME_PORT, timeout=timeout)
        data = None if body is None else json.dumps(body)
        conn.request(method, path, body=data, headers={"Content-Type": "application/json"} if data else {})
        r = conn.getresponse()
        text = r.read().decode("utf-8", "replace")
        conn.close()
        return r.status, text
    except (OSError, http.client.HTTPException) as e:
        return 0, str(e)


def _json(text: str):
    try:
        return json.loads(text)
    except ValueError:
        return None


# --- Schema lesen -----------------------------------------------------------------------------
def _ops(spec: dict) -> list[dict]:
    """Flache Liste {path, method, params:[{name,in,enum,type}], summary}."""
    out = []
    for path, item in (spec.get("paths") or {}).items():
        for method, op in (item or {}).items():
            if method.lower() not in ("get", "put", "post", "patch") or not isinstance(op, dict):
                continue
            params = []
            for p in op.get("parameters") or []:
                sch = p.get("schema") or {}
                params.append({"name": p.get("name", ""), "in": p.get("in", "query"), "enum": p.get("enum") or sch.get("enum"), "type": p.get("type") or sch.get("type")})
            out.append({"path": path, "method": method.upper(), "params": params, "summary": str(op.get("summary") or op.get("description") or "")})
    return out


def guess_jump(spec: dict) -> dict | None:
    """Endpunkt zum Springen im Replay: Pfad mit 'replay' + Sprung-Wort und ein Zeit-Parameter."""
    best, score = None, 0
    for o in _ops(spec):
        low = o["path"].lower()
        if "replay" not in low or o["method"] == "GET":
            continue
        sc = sum(w in low for w in JUMP_WORDS)
        par = next((p for p in o["params"] if p["name"].lower() in TIME_PARAMS), None)
        if par:
            sc += 3
        if sc > score and (par or "{" in o["path"]):
            name = par["name"] if par else re.sub(r".*\{(\w+)\}.*", r"\1", o["path"]) if "{" in o["path"] else "time"
            where = par["in"] if par else "path"
            best, score = {"path": o["path"], "method": o["method"], "param": name, "where": where, "scale": 1}, sc
    return best


def guess_camera(spec: dict, want: str) -> dict | None:
    """Endpunkt zum Setzen der Replay-Kamera: Pfad mit 'camera', nicht Garage/Setup/..."""
    best, score = None, 0
    for o in _ops(spec):
        low = o["path"].lower()
        if "camera" not in low or o["method"] == "GET" or any(w in low for w in CAMERA_SKIP):
            continue
        sc = 2 + (3 if "replay" in low else 0) + (1 if o["params"] or "{" in o["path"] else 0) + (2 if "byname" in low else 0)
        if sc > score:
            par = o["params"][0] if o["params"] else None
            if par:
                where, name, enum = par["in"], par["name"], par["enum"]
            elif "{" in o["path"]:
                where, name, enum = "path", o["path"].split("{")[1].split("}")[0], None
            else:
                where, name, enum = "none", "", None
            value = next((e for e in (enum or []) if want.lower() in str(e).lower()), None)
            if value is None and where in ("path", "query") and "name" in name.lower():
                value = want   # z. B. .../setCameraByName/{cameraName}: der Name geht direkt hinein
            best, score = {"path": o["path"], "method": o["method"], "param": name, "where": where, "value": value, "enum": enum}, sc
    return best


def lookup_value(items, want: str):
    """Aus einer Liste (Strings oder Objekte mit Namen) den Eintrag fuer 'want' suchen. Gibt den Wert fuer den Aufruf."""
    if isinstance(items, dict):
        items = items.get("items") or items.get("cameras") or list(items.values())
    for it in items if isinstance(items, list) else []:
        if isinstance(it, str):
            if want.lower() in it.lower():
                return it
        elif isinstance(it, dict):
            label = str(it.get("name") or it.get("label") or it.get("title") or "")
            if want.lower() in label.lower():
                return next((it[k] for k in ("id", "index", "value", "name") if k in it), label)
    return None


def build_call(plan: dict, value) -> tuple[str, str, object]:
    """(Methode, Pfad mit Query, Body) aus Plan + Wert."""
    path, body = plan["path"], None
    where, name = plan.get("where", "query"), plan.get("param", "")
    if where == "path" and "{" in path:
        path = path.replace("{" + name + "}", quote(str(value), safe=""))
    elif where == "query" and name:
        path += f"?{name}={quote(str(value), safe='')}"
    elif where == "body" and name:
        body = {name: value}
    return plan.get("method", "PUT").upper(), path, body


# --- Fokus / Replay-Zustand ---------------------------------------------------------------------
def _flag(row: dict) -> bool:
    return any(str(k).lower() in FOCUS_KEYS and v in (True, 1, "true") for k, v in row.items())


def parse_focus(text: str, cars: list[dict]) -> int | None:
    """Aus der Antwort die Slot-ID (= mID) des angeschauten Autos lesen. None, wenn nicht erkennbar."""
    data = _json(text)
    rows = data if isinstance(data, list) else (data.get("standings") or data.get("cars") or data.get("vehicles") or []) if isinstance(data, dict) else []
    if isinstance(data, dict) and not rows and any(k in data for k in ID_KEYS):
        rows = [data]
    for row in rows:
        if isinstance(row, dict) and _flag(row):
            for k in ID_KEYS:
                if isinstance(row.get(k), int):
                    return row[k]
            name = str(row.get("driverName") or row.get("driver") or "").lower()
            for c in cars:
                if name and str(c.get("driver", "")).lower() == name:
                    return c.get("id")
    return None


def parse_bool(text: str) -> bool | None:
    v = _json(text)
    if isinstance(v, bool):
        return v
    if isinstance(v, dict):
        for k, x in v.items():
            if isinstance(x, bool):
                return x
    return {"true": True, "false": False}.get(text.strip().lower())


class FocusTracker:
    """Welches Auto schaut man im Spiel gerade an? Reihenfolge: Spiel meldet es > letzter Website-Befehl > eigenes Auto (Shared Memory)."""

    def __init__(self, request=game_request, poll_s: float = STATE_POLL_S):
        self._req, self._poll = request, poll_s
        self._rest: tuple[int, float] | None = None
        self._cmd: int | None = None
        self._replay: tuple[bool, float] | None = None
        self._cars: list[dict] = []
        self._stop = threading.Event()
        self._last_src = ""

    def start(self):
        threading.Thread(target=self._loop, daemon=True).start()

    def stop(self):
        self._stop.set()

    def note_command(self, car_id):
        self._cmd = car_id

    def _loop(self):
        while not self._stop.wait(self._poll):
            for path in ("/rest/watch/standings", "/rest/watch/focus"):
                st, text = self._req("GET", path, None, 2.0)
                if st == 200:
                    fid = parse_focus(text, self._cars)
                    if fid is not None:
                        self._rest = (fid, time.time())
                        break
            st, text = self._req("GET", "/rest/replay/isActive", None, 2.0)
            if st == 200:
                v = parse_bool(text)
                if v is not None:
                    self._replay = (v, time.time())

    def apply(self, payload: dict):
        """Setzt session.focusId / focusSrc / replay im Paket."""
        self._cars = payload.get("cars", [])
        s = payload["session"]
        ids = {c.get("id") for c in self._cars}
        src, fid = "memory", s.get("focusId")
        if self._rest and time.time() - self._rest[1] < 8 and self._rest[0] in ids:
            src, fid = "game", self._rest[0]
        elif self._cmd is not None and self._cmd in ids:
            src, fid = "command", self._cmd
        s["focusId"], s["focusSrc"] = fid, src
        s["replay"] = self._replay[0] if self._replay and time.time() - self._replay[1] < 10 else None
        if src != self._last_src:
            self._last_src = src
            print(f"[Fokus] Quelle: {src} (game = vom Spiel gemeldet, command = per Website gewaehlt, memory = eigenes Auto)")


# --- Befehle der Website ------------------------------------------------------------------------
class GameControl(threading.Thread):
    def __init__(self, site_url: str, token: str, jump=None, camera=None, camera_name: str = "Swingarm", request=game_request):
        super().__init__(daemon=True)
        u = urlparse(site_url)
        self._https, self._host, self._base = u.scheme != "http", u.netloc, u.path.rstrip("/")
        self._token = token
        self._jump_cfg, self._cam_cfg, self._cam_name = jump, camera, camera_name
        self._req = request
        self._spec: dict | None = None
        self._cars: list[dict] = []
        self.on_focus = lambda car_id: None
        self._stop = threading.Event()

    def set_cars(self, cars: list[dict]):
        self._cars = cars

    # -- Website --
    def _site(self, method: str, body=None):
        cls = http.client.HTTPSConnection if self._https else http.client.HTTPConnection
        try:
            c = cls(self._host, timeout=6)
            c.request(method, self._base + "/api/commands", body=None if body is None else json.dumps(body),
                      headers={"x-ingest-token": self._token, "Content-Type": "application/json"})
            r = c.getresponse()
            data = r.read().decode("utf-8", "replace")
            c.close()
            return r.status, _json(data)
        except (OSError, http.client.HTTPException):
            return 0, None

    def run(self):
        while not self._stop.wait(POLL_S):
            st, data = self._site("GET")
            if st != 200 or not isinstance(data, dict):
                continue
            for cmd in data.get("commands", []):
                try:
                    ok, msg = self.handle(cmd)
                except Exception as e:  # noqa: BLE001
                    ok, msg = False, f"Fehler: {e}"
                self._site("POST", {"id": cmd.get("id"), "status": "done" if ok else "failed", "message": msg})

    # -- Spiel --
    def schema(self) -> dict:
        if self._spec is None:
            st, text = self._req("GET", "/swagger-schema.json", None, 4.0)
            self._spec = (_json(text) if st == 200 else None) or {}
        return self._spec

    def car_id(self, cmd: dict) -> int | None:
        num, name = cmd.get("car_number"), str(cmd.get("driver") or "").lower()
        for c in self._cars:
            if num is not None and str(c.get("num")) == str(num):
                return c.get("id")
        for c in self._cars:
            if name and str(c.get("driver", "")).lower() == name:
                return c.get("id")
        return None

    def replay_active(self) -> bool | None:
        st, text = self._req("GET", "/rest/replay/isActive", None, 2.0)
        return parse_bool(text) if st == 200 else None

    def set_replay(self, want: bool) -> str | None:
        if self.replay_active() == want:
            return None
        st, text = self._req("POST", "/rest/replay/toggleactive", None, 3.0)
        if st == 0:
            return "Spiel nicht erreichbar (laeuft Le Mans Ultimate?)"
        time.sleep(1.5)
        return None

    def focus_car(self, cid: int) -> str | None:
        st, text = self._req("PUT", f"/rest/watch/focus/{cid}", None, 3.0)
        self.on_focus(cid)
        return None if st in (200, 204) else f"Auto waehlen: Status {st}"

    def do_jump(self, t: float) -> str | None:
        plan = self._jump_cfg or guess_jump(self.schema())
        if not plan:
            return "Kein Sprung-Endpunkt gefunden. `py lmu_reader.py --game-endpoints` ausfuehren und replay_jump in config.json eintragen."
        value = t * float(plan.get("scale", 1))
        m, path, body = build_call(plan, int(value) if float(plan.get("scale", 1)) != 1 else value)
        st, text = self._req(m, path, body, 4.0)
        return None if st in (200, 204) else f"Sprung: Status {st} {text[:80]}"

    def set_camera(self) -> str | None:
        plan = self._cam_cfg or guess_camera(self.schema(), self._cam_name)
        if not plan:
            return "Kamera-Endpunkt nicht gefunden"
        value = plan.get("value")
        if value is None and plan.get("where") != "none":
            st, text = self._req("GET", plan["path"].split("{")[0].rstrip("/"), None, 3.0)
            value = lookup_value(_json(text) if st == 200 else None, self._cam_name)
        if value is None and plan.get("where") != "none":
            return f"Kamera '{self._cam_name}' nicht gefunden"
        m, path, body = build_call(plan, value)
        st, _ = self._req(m, path, body, 3.0)
        return None if st in (200, 204) else f"Kamera: Status {st}"

    def handle(self, cmd: dict) -> tuple[bool, str]:
        kind = cmd.get("kind")
        if kind == "jump":
            if cmd.get("target_time") is None:
                return False, "Keine Zeit"
            err = self.set_replay(True) or self.do_jump(float(cmd["target_time"]))
            if err:
                return False, err
            cid = self.car_id(cmd)
            notes = []
            if cid is not None:
                time.sleep(0.4)
                self.focus_car(cid)
            time.sleep(0.6)   # erst springen, dann die Kamera aendern, sonst greift sie nicht
            cam = self.set_camera()
            if cam:
                notes.append(cam)
            return True, "Gesprungen" + (f" ({'; '.join(notes)})" if notes else f", Kamera {self._cam_name}")
        if kind == "live":
            err = self.set_replay(False)
            return (False, err) if err else (True, "Live")
        if kind == "focus":
            cid = self.car_id(cmd)
            if cid is None:
                return False, "Auto nicht in den Live-Daten gefunden"
            err = self.focus_car(cid)
            return (False, err) if err else (True, "Auto gewaehlt")
        if kind in ("next", "prev"):
            st, _ = self._req("PUT", "/rest/watch/focusForward" if kind == "next" else "/rest/watch/focusBackward", None, 3.0)
            self.on_focus(None)
            return (st in (200, 204)), "OK" if st in (200, 204) else f"Status {st}"
        return False, "Unbekannter Befehl"


def dump_endpoints() -> int:
    """py lmu_reader.py --game-endpoints : zeigt Replay-/Kamera-Endpunkte des Spiels und was der Reader davon waehlt."""
    st, text = game_request("GET", "/swagger-schema.json", None, 4.0)
    if st != 200:
        print(f"Spiel nicht erreichbar auf {GAME_HOST}:{GAME_PORT} (Status {st}). Spiel starten und nochmal versuchen.")
        return 1
    spec = _json(text) or {}
    for o in _ops(spec):
        if any(w in o["path"].lower() for w in ("replay", "camera", "watch")):
            print(f"{o['method']:5} {o['path']}  {[p['name'] for p in o['params']]}  {o['summary'][:70]}")
    print("\nSprung gewaehlt:", guess_jump(spec))
    print("Kamera gewaehlt:", guess_camera(spec, "Swingarm"))
    return 0
