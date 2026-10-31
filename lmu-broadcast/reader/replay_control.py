"""
Replay-Sprung im Spiel
======================
Die Website-Knoepfe "Im Spiel anspringen" legen einen Befehl an. Dieser Thread holt ihn alle
paar Sekunden bei der Website ab (GET {site_url}/api/commands), fuehrt ihn aus und meldet das
Ergebnis zurueck (POST {site_url}/api/commands).

Ausgefuehrt wird er ueber die lokale REST-Schnittstelle von Le Mans Ultimate (http://127.0.0.1:6397,
laeuft mit dem Spiel, Beschreibung unter /swagger-schema.json). Welcher Endpunkt zum Springen im Replay
taugt, ist nicht offiziell dokumentiert. Darum:
  1. Der Reader sucht im Swagger-Schema selbst nach einem passenden Replay-Endpunkt.
  2. Findet er keinen (oder den falschen), zeigt `py lmu_reader.py --replay-endpoints` alle Replay-Endpunkte
     des Spiels, und du traegst den richtigen in config.json unter "replay_jump" ein, z. B.
       "replay_jump": {"path": "/rest/replay/seek", "method": "POST", "param": "time", "where": "query", "scale": 1}
     where: query | body | path.  scale: Faktor auf Sekunden (1000 fuer Millisekunden).
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from urllib.parse import quote, urlparse

GAME_HOST = "127.0.0.1"
GAME_PORT = 6397
POLL_S = 1.5

PATH_WORDS = ("seek", "jump", "goto", "scrub", "time", "position", "playback")
PARAM_WORDS = ("time", "second", "position", "seek", "offset", "et", "pos")

# Fahrzeug/Kamera im Replay waehlen
FOCUS_AREAS = ("replay", "watch", "camera", "spectat", "broadcast")
FOCUS_PATH_WORDS = ("focus", "camera", "vehicle", "car", "driver", "slot", "select", "follow", "target")
FOCUS_PARAM_WORDS = ("slot", "vehicle", "car", "driver", "focus", "target", "id", "index", "name", "number")
FOCUS_SKIP = ("garage", "strategy", "setup", "pitstop", "weather", "hud", "standings")


def _game_request(method: str, path: str, body: bytes | None = None, timeout: float = 5.0):
    conn = http.client.HTTPConnection(GAME_HOST, GAME_PORT, timeout=timeout)
    try:
        headers = {"Content-Type": "application/json"} if body is not None else {}
        conn.request(method.upper(), path, body, headers)
        resp = conn.getresponse()
        return resp.status, resp.read().decode("utf-8", "replace")
    finally:
        conn.close()


def load_schema() -> dict:
    status, text = _game_request("GET", "/swagger-schema.json")
    if status != 200:
        raise RuntimeError(f"Swagger-Schema nicht lesbar (HTTP {status})")
    return json.loads(text)


def replay_operations(spec: dict, areas: tuple = ("replay",)) -> list[dict]:
    """Alle Operationen, deren Pfad eines der Stichwoerter enthaelt (Standard: 'replay')."""
    out = []
    for path, ops in (spec.get("paths") or {}).items():
        if not any(a in path.lower() for a in areas):
            continue
        for method, op in (ops or {}).items():
            if method.lower() not in ("get", "post", "put", "patch"):
                continue
            params = []
            for prm in (op or {}).get("parameters", []) or []:
                row = {"name": prm.get("name", ""), "in": prm.get("in", "")}
                enum = prm.get("enum") or (prm.get("schema") or {}).get("enum")
                if enum:
                    row["enum"] = enum
                props = ((prm.get("schema") or {}).get("properties")) or {}
                if props:
                    row["fields"] = list(props.keys())
                params.append(row)
            out.append({"path": path, "method": method.upper(), "params": params, "summary": (op or {}).get("summary", "")})
    return out


def guess_plan(spec: dict) -> dict | None:
    """Sucht im Schema einen Endpunkt, der im Replay an eine Zeit springt."""
    best = None
    for op in replay_operations(spec):
        low = op["path"].lower()
        if not any(w in low for w in PATH_WORDS):
            continue
        for prm in op["params"]:
            name = prm["name"].lower()
            if prm["in"] in ("query", "path") and any(w == name or w in name for w in PARAM_WORDS):
                plan = {"path": op["path"], "method": op["method"], "param": prm["name"], "where": prm["in"], "scale": 1}
                if best is None:
                    best = plan
            for field in prm.get("fields", []):
                if any(w == field.lower() or w in field.lower() for w in PARAM_WORDS) and best is None:
                    best = {"path": op["path"], "method": op["method"], "param": field, "where": "body", "scale": 1}
    return best


def guess_focus_plan(spec: dict) -> dict | None:
    """Sucht einen Endpunkt, der im Replay ein bestimmtes Fahrzeug anwaehlt (Kamera/Fokus)."""
    # Bekannter Endpunkt von LMU: PUT /rest/watch/focus/{slotid}
    for op in replay_operations(spec, FOCUS_AREAS):
        if op["path"].lower().rstrip("/").endswith("/watch/focus/{slotid}") and op["method"].upper() == "PUT":
            prm = next((q for q in op["params"] if q["in"] == "path"), None)
            if prm:
                return {"path": op["path"], "method": op["method"], "param": prm["name"], "where": "path", "by": "slot"}
    for op in replay_operations(spec, FOCUS_AREAS):
        low = op["path"].lower()
        if any(w in low for w in FOCUS_SKIP) or not any(w in low for w in FOCUS_PATH_WORDS):
            continue
        for prm in op["params"]:
            name = prm["name"].lower()
            if prm["in"] in ("query", "path") and any(w in name for w in FOCUS_PARAM_WORDS):
                return {"path": op["path"], "method": op["method"], "param": prm["name"], "where": prm["in"], "by": "slot"}
            for field in prm.get("fields", []):
                if any(w in field.lower() for w in FOCUS_PARAM_WORDS):
                    return {"path": op["path"], "method": op["method"], "param": field, "where": "body", "by": "slot"}
    return None


def resolve_car(cars: list[dict], number, name: str | None) -> dict | None:
    """Findet das Auto in den aktuellen Spieldaten: erst ueber die Startnummer, dann ueber den Fahrernamen."""
    if number is not None:
        for c in cars:
            if c.get("num") == number:
                return c
    if name:
        low = name.strip().lower()
        for c in cars:
            if str(c.get("driver", "")).strip().lower() == low:
                return c
    return None


def focus_value(plan: dict, car: dict | None, number, name: str | None):
    """Welcher Wert an die Schnittstelle geht: Slot-ID (Standard), Startnummer oder Name."""
    by = plan.get("by", "slot")
    if by == "number":
        return number if number is not None else (car or {}).get("num")
    if by == "name":
        return name or (car or {}).get("driver")
    return (car or {}).get("id")


def build_focus_call(plan: dict, value) -> tuple[str, str, bytes | None]:
    path, where, param = plan["path"], plan.get("where", "query"), plan["param"]
    body = None
    if where == "path":
        path = path.replace("{" + param + "}", quote(str(value)))
    elif where == "body":
        body = json.dumps({param: value}).encode("utf-8")
    else:
        path = f"{path}?{quote(param)}={quote(str(value))}"
    return plan.get("method", "POST").upper(), path, body


def build_call(plan: dict, seconds: float) -> tuple[str, str, bytes | None]:
    value = seconds * float(plan.get("scale", 1))
    shown = f"{value:g}"
    path, where, param = plan["path"], plan.get("where", "query"), plan["param"]
    body = None
    if where == "path":
        path = path.replace("{" + param + "}", quote(shown))
    elif where == "body":
        body = json.dumps({param: value}).encode("utf-8")
    else:
        path = f"{path}?{quote(param)}={quote(shown)}"
    return plan.get("method", "POST").upper(), path, body


TRANSPORT_DEFAULT = {"play": "Play", "pause": "Pause", "slow": "SlowMotion", "rewind": "Rewind", "forward": "FastForward"}
TRANSPORT_ALIASES = {
    "play": ["Play", "play", "PLAY"],
    "pause": ["Pause", "pause", "TogglePause"],
    "slow": ["SlowMotion", "Slow", "slowmotion"],
    "rewind": ["Rewind", "rewind", "Reverse"],
    "forward": ["FastForward", "fastforward", "Forward"],
}
PROBE_NAMES = ["Play", "Pause", "Stop", "TogglePause", "PlayPause", "SlowMotion", "Slow", "Rewind", "FastForward",
               "Forward", "Backward", "Reverse", "StepForward", "StepBackward", "play", "pause", "slowmotion", "rewind", "fastforward"]


def _resolve(spec: dict, node, depth: int = 0):
    """Loest $ref-Verweise im Schema auf (bis 4 Ebenen)."""
    if depth > 4:
        return node
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/"):
            cur = spec
            for part in ref[2:].split("/"):
                cur = cur.get(part, {}) if isinstance(cur, dict) else {}
            return _resolve(spec, cur, depth + 1)
        return {k: _resolve(spec, v, depth + 1) for k, v in node.items()}
    if isinstance(node, list):
        return [_resolve(spec, v, depth + 1) for v in node]
    return node


def _enums(node):
    if isinstance(node, dict):
        if isinstance(node.get("enum"), list):
            yield node["enum"]
        for v in node.values():
            yield from _enums(v)
    elif isinstance(node, list):
        for v in node:
            yield from _enums(v)


def schema_transport(spec: dict) -> dict:
    """Liest die erlaubten Replay-Befehle aus dem Spiel-Schema und ordnet sie den Knoepfen zu."""
    names: list[str] = []
    for path, ops in (spec.get("paths") or {}).items():
        if "replaycommand" in path.lower():
            for lst in _enums(_resolve(spec, ops)):
                names += [str(x) for x in lst]
    if not names:
        for lst in _enums(spec):
            if any("pause" in str(x).lower() for x in lst):
                names += [str(x) for x in lst]
    rules = {"pause": ("pause",), "slow": ("slow",), "rewind": ("rew", "back", "revers"), "forward": ("fast", "forward"), "play": ("play",)}
    out: dict = {}
    for key, words in rules.items():
        for n in names:
            low = n.lower()
            if any(w in low for w in words) and not (key == "play" and "pause" in low) and not (key == "forward" and "step" in low) and not (key == "rewind" and "step" in low):
                out[key] = n
                break
    return out


def dump_commands() -> int:
    """py lmu_reader.py --replay-commands : zeigt, welche Replay-Befehle das Spiel laut Schema kennt."""
    try:
        spec = load_schema()
    except Exception as exc:
        print(f"Spiel nicht erreichbar ({exc})")
        return 1
    for path, ops in (spec.get("paths") or {}).items():
        if "replaycommand" in path.lower():
            print(path)
            print(json.dumps(_resolve(spec, ops), indent=1, ensure_ascii=False)[:3000])
    found = schema_transport(spec)
    print("Zuordnung aus dem Schema:", found or "nichts gefunden")
    return 0


def probe_commands() -> int:
    """py lmu_reader.py --replay-probe : probiert Replay-Befehle im Spiel durch und zeigt die Antworten.
    Spiel muss im Replay sein. Die Befehle wirken wirklich (Replay laeuft, haelt an ...)."""
    print("Probiere PUT /rest/watch/replayCommand/{Name}. Das Spiel sollte im Replay sein. Antworten:")
    for name in PROBE_NAMES:
        try:
            status, text = _game_request("PUT", f"/rest/watch/replayCommand/{quote(name)}")
        except Exception as exc:
            print(f"  {name:14} Spiel nicht erreichbar ({type(exc).__name__})")
            return 1
        print(f"  {name:14} HTTP {status}  {text[:100]!r}")
        time.sleep(0.8)
    return 0


def dump_endpoints() -> int:
    """py lmu_reader.py --replay-endpoints : zeigt alle Replay-Endpunkte des Spiels."""
    try:
        spec = load_schema()
    except Exception as exc:
        print(f"Spiel nicht erreichbar ({exc}). Laeuft Le Mans Ultimate? (REST-Schnittstelle auf Port {GAME_PORT})")
        return 1
    ops = replay_operations(spec)
    try:
        with open("lmu-api.json", "w", encoding="utf-8") as f:
            json.dump(spec, f, indent=1)
        print("Komplettes Schema gespeichert: lmu-api.json")
    except OSError:
        pass
    if not ops:
        print("Das Spiel meldet keinen Endpunkt mit 'replay' im Namen.")
        return 0
    print(f"{len(ops)} Replay-Endpunkte im Spiel:")
    for op in ops:
        params = ", ".join(f"{p['name']}({p['in']})" for p in op["params"]) or "keine Parameter"
        print(f"  {op['method']:5} {op['path']}  [{params}] {op['summary']}")
    plan = guess_plan(spec)
    print("Sprung automatisch gewaehlt:", json.dumps(plan) if plan else "nichts Passendes gefunden")
    focus_ops = [o for o in replay_operations(spec, FOCUS_AREAS) if not any(w in o["path"].lower() for w in FOCUS_SKIP)]
    print(f"\n{len(focus_ops)} Endpunkte fuer Replay/Kamera/Zuschauer (fuer den Fahrzeugwechsel):")
    for op in focus_ops:
        params = ", ".join(f"{p['name']}({p['in']})" + (f"{{{','.join(p['fields'])}}}" if p.get("fields") else "") + (f" erlaubt: {p['enum']}" if p.get("enum") else "") for p in op["params"]) or "keine Parameter"
        print(f"  {op['method']:5} {op['path']}  [{params}] {op['summary']}")
    fplan = guess_focus_plan(spec)
    print("Fahrzeugwechsel automatisch gewaehlt:", json.dumps(fplan) if fplan else "nichts Passendes gefunden")
    return 0


class ReplayControl(threading.Thread):
    def __init__(self, site_url: str, token: str, override: dict | None = None, poll_s: float = POLL_S,
                 focus_override: dict | None = None, focus_delay_s: float = 0.7, transport: dict | None = None):
        super().__init__(daemon=True)
        parsed = urlparse(site_url)
        self._https = parsed.scheme != "http"
        self._host = parsed.netloc
        self._path = (parsed.path.rstrip("/") or "") + "/api/commands"
        self._headers = {"Content-Type": "application/json", "x-ingest-token": token}
        self._override = override if isinstance(override, dict) and override.get("path") else None
        self._poll = poll_s
        self._focus_override = focus_override if isinstance(focus_override, dict) and focus_override.get("path") else None
        self._focus_plan: dict | None = None
        self._focus_delay = focus_delay_s
        self._transport = dict(TRANSPORT_DEFAULT)
        self._transport_loaded = False
        self._transport_cfg = {k for k, v in (transport or {}).items() if v} if isinstance(transport, dict) else set()
        if isinstance(transport, dict):
            self._transport.update({k: str(v) for k, v in transport.items() if k in TRANSPORT_DEFAULT and v})
        self._enter_delay = 1.5
        self._cars: list[dict] = []
        self._seen: set[str] = set()
        self._plan: dict | None = None
        self.done = 0
        self.failed = 0
        self.last_message = ""
        self.last_error = None

    # ---------------------------------------------------------------- Website
    def _site(self, method: str, body: dict | None = None):
        cls = http.client.HTTPSConnection if self._https else http.client.HTTPConnection
        conn = cls(self._host, timeout=8)
        try:
            data = json.dumps(body).encode("utf-8") if body is not None else None
            conn.request(method, self._path, data, self._headers)
            resp = conn.getresponse()
            return resp.status, resp.read().decode("utf-8", "replace")
        finally:
            conn.close()

    def fetch(self) -> list[dict]:
        status, text = self._site("GET")
        if status != 200:
            raise RuntimeError(f"HTTP {status}")
        return json.loads(text).get("commands", [])

    def report(self, cmd_id: str, ok: bool, message: str) -> None:
        self._site("POST", {"id": cmd_id, "status": "done" if ok else "failed", "message": message})

    # ------------------------------------------------------------------- Spiel
    def set_cars(self, cars: list[dict]) -> None:
        """Aktuelle Autos der Session (aus dem Paket), um Startnummer/Name auf die Slot-ID abzubilden."""
        self._cars = cars or []

    def focus(self, number, name: str | None) -> tuple[bool, str]:
        """Im Replay das Fahrzeug anwaehlen. Rueckgabe: (geklappt, Text)."""
        label = f"#{number}" if number is not None else (name or "")
        if number is None and not name:
            return True, ""
        plan = self._focus_override or self._focus_plan
        if plan is None:
            try:
                plan = self._focus_plan = guess_focus_plan(load_schema())
            except Exception as exc:
                return False, f"Fahrzeugwechsel: Spiel nicht erreichbar ({type(exc).__name__})"
        if plan is None:
            return False, "Fahrzeugwechsel: kein Endpunkt gefunden (Reader mit --replay-endpoints starten)"
        car = resolve_car(self._cars, number, name)
        value = focus_value(plan, car, number, name)
        if value is None:
            return False, f"Fahrzeugwechsel: {label} nicht in den Spieldaten gefunden"
        method, path, body = build_focus_call(plan, value)
        try:
            status, text = _game_request(method, path, body)
        except Exception as exc:
            return False, f"Fahrzeugwechsel: Spiel nicht erreichbar ({type(exc).__name__})"
        if 200 <= status < 300:
            return True, f"Kamera auf {label}"
        return False, f"Fahrzeugwechsel: Spiel antwortet HTTP {status} auf {method} {plan['path']}: {text[:80]}"

    def replay_active(self) -> bool | None:
        """Ist das Spiel gerade im Replay? None, wenn das Spiel es nicht sagt."""
        try:
            status, text = _game_request("GET", "/rest/replay/isActive")
        except Exception:
            return None
        if status != 200:
            return None
        t = text.strip().lower()
        if t in ("true", "1"):
            return True
        if t in ("false", "0"):
            return False
        try:
            v = json.loads(text)
        except ValueError:
            return None
        if isinstance(v, dict):
            v = next((x for x in v.values() if isinstance(x, bool)), None)
        return v if isinstance(v, bool) else None

    def _toggle_replay(self) -> bool:
        try:
            status, _ = _game_request("POST", "/rest/replay/toggleactive")
        except Exception:
            return False
        return 200 <= status < 300

    def cycle_car(self, forward: bool) -> tuple[bool, str]:
        """Naechstes / vorheriges Auto anwaehlen (Zuschauerkamera)."""
        path = "/rest/watch/focusForward" if forward else "/rest/watch/focusBackward"
        try:
            status, text = _game_request("PUT", path)
        except Exception as exc:
            return False, f"Spiel nicht erreichbar ({type(exc).__name__})"
        if 200 <= status < 300:
            return True, "Naechstes Auto" if forward else "Vorheriges Auto"
        return False, f"Spiel antwortet HTTP {status} auf PUT {path}: {text[:80]}"

    def transport(self, key: str) -> tuple[bool, str]:
        """Replay-Knoepfe: play, pause, slow, rewind, forward. Probiert bekannte Schreibweisen, merkt sich die erste, die klappt."""
        if not self._transport_loaded:
            self._transport_loaded = True
            try:
                for k, v in schema_transport(load_schema()).items():
                    if k not in self._transport_cfg:
                        self._transport[k] = v
            except Exception:
                pass
        value = self._transport.get(key)
        if not value:
            return False, f"Unbekannter Replay-Knopf: {key}"
        names = [value] + [n for n in TRANSPORT_ALIASES.get(key, []) if n != value]
        last = ""
        for name in names:
            try:
                status, text = _game_request("PUT", f"/rest/watch/replayCommand/{quote(name)}")
            except Exception as exc:
                return False, f"Spiel nicht erreichbar ({type(exc).__name__})"
            if 200 <= status < 300:
                self._transport[key] = name
                return True, f"Replay: {name}"
            last = f"HTTP {status} {text[:60]}"
        return False, f"Spiel kennt den Befehl '{value}' nicht ({last}). Reader mit --replay-probe starten und config.json -> replay_transport anpassen."

    def go_live(self) -> tuple[bool, str]:
        """Aus dem Replay zurueck zum Live-Bild."""
        active = self.replay_active()
        if active is False:
            return True, "Spiel zeigt schon das Live-Bild"
        if not self._toggle_replay():
            return False, "Zurueck zu Live: Spiel antwortet nicht"
        return True, "Zurueck zum Live-Bild"

    def jump(self, seconds: float) -> tuple[bool, str]:
        plan = self._override or self._plan
        if plan is None:
            try:
                plan = self._plan = guess_plan(load_schema())
            except Exception as exc:
                return False, f"Spiel nicht erreichbar ({exc}). Laeuft Le Mans Ultimate?"
        if plan is None:
            return False, "Kein Replay-Sprung im Spiel gefunden. Reader mit --replay-endpoints starten."
        method, path, body = build_call(plan, seconds)
        try:
            status, text = _game_request(method, path, body)
        except Exception as exc:
            self._plan = None
            return False, f"Spiel nicht erreichbar ({type(exc).__name__})"
        if 200 <= status < 300:
            return True, f"Replay springt zu {seconds:.0f} s"
        return False, f"Spiel antwortet HTTP {status} auf {method} {plan['path']}: {text[:80]}"

    # --------------------------------------------------------------- Schleife
    def handle(self, cmd: dict) -> None:
        cmd_id = str(cmd.get("id", ""))
        if not cmd_id or cmd_id in self._seen:
            return
        self._seen.add(cmd_id)
        kind = cmd.get("kind") or "jump"
        try:
            seconds = float(cmd.get("time")) if kind == "jump" else 0.0
        except (TypeError, ValueError):
            ok, msg = False, "Ungueltige Zeit"
        else:
            if kind == "live":
                ok, msg = self.go_live()
            elif kind == "transport":
                ok, msg = self.transport(str(cmd.get("command") or ""))
            elif kind in ("next", "prev"):
                ok, msg = self.cycle_car(kind == "next")
            elif kind == "focus":
                ok, msg = self.focus(cmd.get("car"), cmd.get("driver"))
                msg = msg or "Kein Auto angegeben"
                ok = ok and bool(cmd.get("car") is not None or cmd.get("driver"))
            else:
                entered = False
                if self.replay_active() is False:  # live im Spiel: erst ins Replay wechseln
                    entered = self._toggle_replay()
                    if entered:
                        time.sleep(self._enter_delay)
                ok, msg = self.jump(seconds)
                if ok and entered:
                    msg = "Replay geoeffnet. " + msg
            if ok and kind == "jump":
                number = cmd.get("car")
                name = cmd.get("driver")
                if number is not None or name:
                    time.sleep(self._focus_delay)
                    f_ok, f_msg = self.focus(number, name)
                    if f_msg:
                        msg = f"{msg}. {f_msg}"
        if ok:
            self.done += 1
        else:
            self.failed += 1
        self.last_message = msg
        print(f"[Replay] {'OK' if ok else 'FEHLER'}: {msg}")
        try:
            self.report(cmd_id, ok, msg)
        except Exception as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"

    def poll_once(self) -> None:
        for cmd in self.fetch():
            self.handle(cmd)

    def run(self) -> None:
        while True:
            try:
                self.poll_once()
                self.last_error = None
            except Exception as exc:
                self.last_error = f"{type(exc).__name__}: {exc}"
            time.sleep(self._poll)
