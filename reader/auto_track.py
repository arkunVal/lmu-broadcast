"""
Automatische Streckenkarte
==========================
Ablauf je Strecke:
  1. Website fragen: gibt es die Karte schon?  (GET /api/tracks/<slug>?meta=1)
  2. Ja  -> nichts tun.
     Nein -> waehrend du faehrst im Hintergrund aufnehmen (TrackRecorder).
  3. Aufnahme vollstaendig -> hochladen (POST /api/tracks, Header x-ingest-token).
Die Website behaelt die bessere Version, falls schon eine existiert.
Netzwerk laeuft in kurzen Hintergrund-Threads, die Hauptschleife wird nie blockiert.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from urllib.parse import urlparse

from payload import MAX_CARS, _txt
from track_recorder import MIN_FILL, TrackRecorder, track_slug

RETRY_S = 30.0


class AutoTrack:
    def __init__(self, site_url: str, token: str, retry_s: float = RETRY_S):
        parsed = urlparse(site_url)
        self._https = parsed.scheme != "http"
        self._host = parsed.netloc
        self._base = parsed.path.rstrip("/")
        self._token = token
        self._retry_s = retry_s
        self._lock = threading.Lock()
        self.recorder = TrackRecorder()
        self.slug = ""
        self.state = "idle"   # idle | check | record | upload | have | uploaded
        self.message = ""
        self._busy = False
        self._retry_at = 0.0

    # ---------------------------------------------------------------- Netz
    def _request(self, method: str, path: str, body: dict | None = None):
        cls = http.client.HTTPSConnection if self._https else http.client.HTTPConnection
        conn = cls(self._host, timeout=15)
        try:
            data = json.dumps(body, separators=(",", ":")).encode("utf-8") if body is not None else None
            headers = {"x-ingest-token": self._token}
            if data is not None:
                headers["Content-Type"] = "application/json"
            conn.request(method, self._base + path, data, headers)
            resp = conn.getresponse()
            text = resp.read().decode("utf-8", "replace")
            return resp.status, text
        finally:
            conn.close()

    def _run(self, job, *args):
        def target():
            try:
                job(*args)
            except Exception as exc:  # noqa: BLE001
                with self._lock:
                    self.message = f"Netzfehler: {type(exc).__name__}"
                    self._retry_at = time.monotonic() + self._retry_s
            finally:
                with self._lock:
                    self._busy = False

        with self._lock:
            self._busy = True
        threading.Thread(target=target, daemon=True).start()

    def _check_job(self, slug: str):
        status, text = self._request("GET", f"/api/tracks/{slug}?meta=1")
        with self._lock:
            if slug != self.slug:
                return
            if status == 404:
                self.state = "record"
                self.message = "Strecke noch unbekannt, Aufnahme laeuft beim Fahren"
            elif status == 200:
                try:
                    cov = float(json.loads(text).get("coverage") or 0)
                except Exception:  # noqa: BLE001
                    cov = 0.0
                if cov >= MIN_FILL:
                    self.state = "have"
                    self.message = "Streckenkarte schon vorhanden"
                else:
                    self.state = "record"
                    self.message = "Vorhandene Karte unvollstaendig, nehme neu auf"
            else:
                self.message = f"Strecken-Abfrage HTTP {status}"
                self._retry_at = time.monotonic() + self._retry_s

    def _upload_job(self, slug: str, payload: dict):
        status, text = self._request("POST", "/api/tracks", payload)
        with self._lock:
            if slug != self.slug:
                return
            if 200 <= status < 300:
                self.state = "uploaded"
                self.message = "Streckenkarte gespeichert"
            elif status in (408, 429) or status >= 500:
                self.message = f"Upload HTTP {status}, neuer Versuch"
                self._retry_at = time.monotonic() + self._retry_s
            else:
                # 401/400: nicht wiederholen
                self.state = "have"
                self.message = f"Upload abgelehnt: HTTP {status} {text[:80]}"

    # ---------------------------------------------------------- Hauptschleife
    def update(self, data) -> None:
        info = data.scoring.scoringInfo
        track = _txt(info.mTrackName)
        count = max(0, min(int(info.mNumVehicles), MAX_CARS))
        if count == 0 or not track or float(info.mLapDist) <= 0:
            return
        slug = track_slug(track)
        with self._lock:
            if slug != self.slug:
                self.slug = slug
                self.state = "check"
                self.message = ""
                self._retry_at = 0.0
            state, busy, retry_at = self.state, self._busy, self._retry_at

        if state == "check" and not busy and time.monotonic() >= retry_at:
            self._run(self._check_job, slug)
        elif state == "record":
            status = self.recorder.update(data)
            with self._lock:
                self.message = status
            if self.recorder.done:
                with self._lock:
                    self.state = "upload"
                state = "upload"
        if state == "upload" and not busy and time.monotonic() >= retry_at:
            self._run(self._upload_job, slug, self.recorder.payload())

    def summary(self) -> str:
        with self._lock:
            return f"Streckenkarte: {self.message or self.state}"
