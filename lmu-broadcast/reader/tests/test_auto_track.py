"""Test der automatischen Streckenaufnahme mit einem lokalen Mock-Server."""
import json
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from auto_track import AutoTrack  # noqa: E402
from reader_key import decode_key, encode_key  # noqa: E402
from test_track_recorder import LENGTH, frame  # noqa: E402


def make_server(known: dict, store: list, status_post=200):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, obj=None):
            body = json.dumps(obj or {}).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            slug = self.path.split("/api/tracks/")[1].split("?")[0]
            if slug in known:
                self._send(200, {"slug": slug, "coverage": known[slug]})
            else:
                self._send(404)

        def do_POST(self):
            n = int(self.headers["Content-Length"])
            body = json.loads(self.rfile.read(n))
            store.append((self.headers.get("x-ingest-token"), body))
            self._send(status_post, {"ok": True})

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def drive(at, until, step=7.0, limit=LENGTH * 1.5):
    d = 0.0
    while d < limit and not until():
        at.update(frame(d))
        d += step
        time.sleep(0.0005)


class AutoTrackTest(unittest.TestCase):
    def wait(self, cond, t=5.0):
        end = time.time() + t
        while time.time() < end:
            if cond():
                return True
            time.sleep(0.02)
        return False

    def test_records_and_uploads_unknown_track(self):
        store = []
        srv = make_server({}, store)
        try:
            at = AutoTrack(f"http://127.0.0.1:{srv.server_port}", "TOKEN123")
            at.update(frame(0))
            self.assertTrue(self.wait(lambda: (at.update(frame(0)), at.state == "record")[1]))
            drive(at, lambda: at.state in ("upload", "uploaded"))
            self.assertTrue(self.wait(lambda: (at.update(frame(0)), at.state == "uploaded")[1]))
            token, body = store[0]
            self.assertEqual(token, "TOKEN123")
            self.assertEqual(body["name"], "Test Track 1")
            self.assertGreaterEqual(body["coverage"], 0.97)
            self.assertEqual(len(body["points"]), 500)
        finally:
            srv.shutdown()
            srv.server_close()

    def test_known_track_not_recorded(self):
        store = []
        srv = make_server({"test-track-1": 0.99}, store)
        try:
            at = AutoTrack(f"http://127.0.0.1:{srv.server_port}", "T")
            self.assertTrue(self.wait(lambda: (at.update(frame(0)), at.state == "have")[1]))
            drive(at, lambda: False, limit=LENGTH)
            self.assertEqual(store, [])
            self.assertEqual(at.recorder.filled, 0.0)
        finally:
            srv.shutdown()
            srv.server_close()

    def test_deleted_map_is_recorded_again(self):
        store = []
        known = {"test-track-1": 0.99}
        srv = make_server(known, store)
        try:
            at = AutoTrack(f"http://127.0.0.1:{srv.server_port}", "T", recheck_s=0.05)
            self.assertTrue(self.wait(lambda: (at.update(frame(0)), at.state == "have")[1]))
            known.clear()  # Karte auf der Website geloescht
            self.assertTrue(self.wait(lambda: (at.update(frame(0)), at.state == "record")[1]))
        finally:
            srv.shutdown()
            srv.server_close()

    def test_server_down_does_not_crash(self):
        at = AutoTrack("http://127.0.0.1:9", "T", retry_s=0.05)
        at.update(frame(0))
        time.sleep(0.2)
        at.update(frame(0))
        self.assertIn("Netzfehler", at.message)

    def test_unauthorized_upload_stops(self):
        store = []
        srv = make_server({}, store, status_post=401)
        try:
            at = AutoTrack(f"http://127.0.0.1:{srv.server_port}", "BAD")
            self.assertTrue(self.wait(lambda: (at.update(frame(0)), at.state == "record")[1]))
            drive(at, lambda: at.state == "upload")
            self.assertTrue(self.wait(lambda: (at.update(frame(0)), at.state == "have")[1]))
            self.assertIn("abgelehnt", at.message)
        finally:
            srv.shutdown()
            srv.server_close()


class ReaderKeyTest(unittest.TestCase):
    def test_roundtrip(self):
        vals = {"supabase_url": "https://x.supabase.co", "anon_key": "k", "room": "r1", "site_url": "https://s.app", "ingest_token": "t"}
        key = encode_key(vals)
        self.assertTrue(key.startswith("LMU1."))
        self.assertEqual(decode_key("  " + key + "\n"), vals)

    def test_resolve_config_overrides(self):
        from lmu_reader import resolve_config
        vals = {"supabase_url": "https://x.supabase.co", "anon_key": "k", "room": "r1", "site_url": "https://s.app", "ingest_token": "t"}
        cfg = resolve_config({"reader_key": encode_key(vals), "rate_hz": 3, "room": "andere"})
        self.assertEqual(cfg["room"], "andere")
        self.assertEqual(cfg["rate_hz"], 3)
        self.assertEqual(cfg["ingest_token"], "t")

    def test_errors(self):
        for bad in ("", "hallo", "LMU1.!!!", encode_key({"anon_key": "k"})):
            with self.assertRaises(ValueError):
                decode_key(bad)


if __name__ == "__main__":
    unittest.main()
