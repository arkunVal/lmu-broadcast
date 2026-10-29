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


def replay_operations(spec: dict) -> list[dict]:
    """Alle Operationen, deren Pfad 'replay' enthaelt."""
    out = []
    for path, ops in (spec.get("paths") or {}).items():
        if "replay" not in path.lower():
            continue
        for method, op in (ops or {}).items():
            if method.lower() not in ("get", "post", "put", "patch"):
                continue
            params = []
            for prm in (op or {}).get("parameters", []) or []:
                row = {"name": prm.get("name", ""), "in": prm.get("in", "")}
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
    print("Automatisch gewaehlt:", json.dumps(plan) if plan else "nichts Passendes gefunden")
    return 0


class ReplayControl(threading.Thread):
    def __init__(self, site_url: str, token: str, override: dict | None = None, poll_s: float = POLL_S):
        super().__init__(daemon=True)
        parsed = urlparse(site_url)
        self._https = parsed.scheme != "http"
        self._host = parsed.netloc
        self._path = (parsed.path.rstrip("/") or "") + "/api/commands"
        self._headers = {"Content-Type": "application/json", "x-ingest-token": token}
        self._override = override if isinstance(override, dict) and override.get("path") else None
        self._poll = poll_s
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
        try:
            seconds = float(cmd.get("time"))
        except (TypeError, ValueError):
            ok, msg = False, "Ungueltige Zeit"
        else:
            ok, msg = self.jump(seconds)
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
