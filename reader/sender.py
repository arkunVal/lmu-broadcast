"""
Schickt die Datenpakete per HTTP an den Supabase-Realtime-Broadcast.

Der Versand laeuft in einem eigenen Thread und verschickt immer nur das
NEUESTE Paket. Ist die Verbindung kurz langsam, staut sich also nichts auf.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from urllib.parse import urlparse


class Sender(threading.Thread):
    def __init__(self, base_url: str, api_key: str, topic: str, event: str = "state", dry_run: bool = False):
        super().__init__(daemon=True)
        parsed = urlparse(base_url)
        self._https = parsed.scheme != "http"
        self._host = parsed.netloc
        self._path = (parsed.path.rstrip("/") or "") + "/realtime/v1/api/broadcast"
        self._headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        self._topic = topic
        self._event = event
        self._dry_run = dry_run

        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._latest = None
        self._conn = None

        # Status fuer die Konsolenanzeige
        self.sent = 0
        self.failed = 0
        self.last_ms = None
        self.last_error = None
        self.last_bytes = 0

    def submit(self, payload: dict) -> None:
        with self._lock:
            self._latest = payload
        self._wake.set()

    # --- intern -------------------------------------------------------------
    def _connection(self):
        if self._conn is None:
            cls = http.client.HTTPSConnection if self._https else http.client.HTTPConnection
            self._conn = cls(self._host, timeout=5)
        return self._conn

    def _drop_connection(self):
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    def _post(self, body: bytes) -> int:
        # Bei abgelaufener Keep-Alive-Verbindung einmal mit frischer Verbindung wiederholen.
        for attempt in (1, 2):
            try:
                conn = self._connection()
                conn.request("POST", self._path, body, self._headers)
                resp = conn.getresponse()
                resp.read()
                return resp.status
            except Exception:
                self._drop_connection()
                if attempt == 2:
                    raise
        return 0

    def run(self) -> None:
        while True:
            self._wake.wait()
            self._wake.clear()
            with self._lock:
                payload, self._latest = self._latest, None
            if payload is None:
                continue

            body = json.dumps(
                {"messages": [{"topic": self._topic, "event": self._event, "payload": payload}]},
                separators=(",", ":"),
            ).encode("utf-8")
            self.last_bytes = len(body)

            if self._dry_run:
                self.sent += 1
                continue

            started = time.perf_counter()
            try:
                status = self._post(body)
                self.last_ms = int((time.perf_counter() - started) * 1000)
                if 200 <= status < 300:
                    self.sent += 1
                    self.last_error = None
                else:
                    self.failed += 1
                    self.last_error = f"HTTP {status}"
            except Exception as exc:  # Netzwerkfehler: weiterlaufen, nicht abstuerzen
                self.failed += 1
                self.last_error = f"{type(exc).__name__}: {exc}"
                time.sleep(1.0)
