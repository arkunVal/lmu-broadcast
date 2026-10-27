"""
Schickt erkannte Vorfall-Hinweise an die Website: POST {site_url}/api/ingest

- Eigener Thread, Warteschlange mit maximal 200 Hinweisen (bei Ueberlauf faellt der aelteste weg).
- Je Anfrage hoechstens 50 Hinweise.
- Bei Netzwerkfehlern, HTTP 408/429 und 5xx wird mit wachsender Wartezeit wiederholt.
- Andere 4xx-Antworten (z. B. 401 falscher Token, 400 ungueltige Daten) werden NICHT wiederholt:
  der Stapel wird verworfen und der Fehler steht in last_error.
"""

from __future__ import annotations

import collections
import http.client
import json
import threading
import time
from urllib.parse import urlparse

MAX_QUEUE = 200
MAX_BATCH = 50
RETRY_STATUS = {408, 429}


class HintSender(threading.Thread):
    def __init__(self, site_url: str, token: str, retry_min_s: float = 2.0, retry_max_s: float = 30.0):
        super().__init__(daemon=True)
        parsed = urlparse(site_url)
        self._https = parsed.scheme != "http"
        self._host = parsed.netloc
        self._path = (parsed.path.rstrip("/") or "") + "/api/ingest"
        self._headers = {"Content-Type": "application/json", "x-ingest-token": token}
        self._retry_min = retry_min_s
        self._retry_max = retry_max_s

        self._lock = threading.Lock()
        self._queue: collections.deque = collections.deque()
        self._wake = threading.Event()
        self._conn = None
        self._failures_in_row = 0
        self._retry_at = 0.0
        self._idle = threading.Event()
        self._idle.set()

        # Status fuer die Konsole
        self.sent = 0
        self.inserted = 0
        self.duplicates = 0
        self.failed = 0
        self.dropped = 0
        self.last_error = None

    # ------------------------------------------------------------------ API
    def submit(self, hints: list[dict]) -> None:
        if not hints:
            return
        with self._lock:
            self._queue.extend(hints)
            self._idle.clear()
            while len(self._queue) > MAX_QUEUE:
                self._queue.popleft()
                self.dropped += 1
        self._wake.set()

    @property
    def queued(self) -> int:
        with self._lock:
            return len(self._queue)

    def wait_idle(self, timeout: float = 5.0) -> bool:
        """Wartet, bis die Warteschlange leer ist (fuer Tests)."""
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if self._idle.is_set():
                return True
            time.sleep(0.01)
        return False

    # --------------------------------------------------------------- intern
    def _connection(self):
        if self._conn is None:
            cls = http.client.HTTPSConnection if self._https else http.client.HTTPConnection
            self._conn = cls(self._host, timeout=8)
        return self._conn

    def _drop_connection(self):
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    def _post(self, body: bytes):
        for attempt in (1, 2):
            try:
                conn = self._connection()
                conn.request("POST", self._path, body, self._headers)
                resp = conn.getresponse()
                text = resp.read().decode("utf-8", "replace")
                return resp.status, text
            except Exception:
                self._drop_connection()
                if attempt == 2:
                    raise
        return 0, ""

    def _take(self) -> list[dict]:
        with self._lock:
            n = min(MAX_BATCH, len(self._queue))
            return [self._queue.popleft() for _ in range(n)]

    def _put_back(self, batch: list[dict]) -> None:
        with self._lock:
            self._queue.extendleft(reversed(batch))
            while len(self._queue) > MAX_QUEUE:
                self._queue.popleft()
                self.dropped += 1

    def run(self) -> None:
        while True:
            self._wake.wait(timeout=1.0)
            self._wake.clear()
            if time.monotonic() < self._retry_at:
                continue
            batch = self._take()
            if not batch:
                self._idle.set()
                continue

            body = json.dumps({"hints": batch}, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            try:
                status, text = self._post(body)
            except Exception as exc:
                self._on_retry(batch, f"{type(exc).__name__}: {exc}")
                continue

            if 200 <= status < 300:
                self.sent += len(batch)
                self.last_error = None
                self._failures_in_row = 0
                try:
                    reply = json.loads(text)
                    self.inserted += int(reply.get("inserted", 0))
                    self.duplicates += int(reply.get("duplicates", 0))
                except Exception:
                    pass
                if self.queued:
                    self._wake.set()
                else:
                    self._idle.set()
            elif status in RETRY_STATUS or status >= 500:
                self._on_retry(batch, f"HTTP {status}")
            else:
                # Nicht wiederholbar (falscher Token, ungueltige Daten ...): Stapel verwerfen
                self.failed += 1
                self.dropped += len(batch)
                self.last_error = f"HTTP {status} (Stapel verworfen): {text[:120]}"
                self._failures_in_row = 0
                if self.queued:
                    self._wake.set()
                else:
                    self._idle.set()

    def _on_retry(self, batch: list[dict], error: str) -> None:
        self.failed += 1
        self.last_error = error
        self._failures_in_row += 1
        wait = min(self._retry_max, self._retry_min * (2 ** (self._failures_in_row - 1)))
        self._retry_at = time.monotonic() + wait
        self._put_back(batch)
