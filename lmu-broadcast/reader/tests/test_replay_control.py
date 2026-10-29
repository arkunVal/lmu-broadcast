import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import replay_control as rc

SPEC = {"paths": {
    "/rest/watch/focus/{slot}": {"post": {"parameters": [{"name": "slot", "in": "path"}]}},
    "/rest/garage/focusX": {"get": {"parameters": [{"name": "id", "in": "query"}]}},
    "/rest/replay/status": {"get": {"parameters": []}},
    "/rest/replay/seek": {"post": {"parameters": [{"name": "time", "in": "query"}]}},
    "/rest/garage/x": {"get": {}},
}}


class Handler(BaseHTTPRequestHandler):
    log = []
    commands = []
    reports = []

    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/swagger-schema.json":
            return self._send(200, SPEC)
        if self.path == "/api/commands":
            return self._send(200, {"commands": Handler.commands})
        self._send(404, {})

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        if self.path == "/api/commands":
            Handler.reports.append(json.loads(body))
            return self._send(200, {"ok": True})
        Handler.log.append(self.path)
        self._send(200, {})


class ReplayControlTests(unittest.TestCase):
    def setUp(self):
        Handler.log, Handler.commands, Handler.reports = [], [], []
        self.srv = HTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        rc.GAME_PORT = self.port

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def test_guess_plan_finds_seek(self):
        plan = rc.guess_plan(SPEC)
        self.assertEqual(plan["path"], "/rest/replay/seek")
        self.assertEqual(plan["param"], "time")
        self.assertEqual(plan["where"], "query")

    def test_no_plan_without_replay(self):
        self.assertIsNone(rc.guess_plan({"paths": {"/rest/garage/x": {"get": {}}}}))

    def test_build_call_variants(self):
        self.assertEqual(rc.build_call({"path": "/a", "method": "POST", "param": "t", "where": "query"}, 12.5), ("POST", "/a?t=12.5", None))
        self.assertEqual(rc.build_call({"path": "/a/{t}", "method": "PUT", "param": "t", "where": "path", "scale": 1000}, 2), ("PUT", "/a/2000", None))
        m, p, b = rc.build_call({"path": "/a", "method": "POST", "param": "t", "where": "body"}, 3)
        self.assertEqual(json.loads(b), {"t": 3.0})

    def test_jump_end_to_end(self):
        ctl = rc.ReplayControl(f"http://127.0.0.1:{self.port}", "x" * 24)
        ctl._host = f"127.0.0.1:{self.port}"
        Handler.commands = [{"id": "c1", "time": 3723.0}]
        ctl.poll_once()
        ctl.poll_once()  # zweimal gesehen -> nur einmal ausgefuehrt
        self.assertEqual(Handler.log, ["/rest/replay/seek?time=3723"])
        self.assertEqual(len(Handler.reports), 1)
        self.assertEqual(Handler.reports[0]["status"], "done")

    def test_no_endpoint_reports_failure(self):
        global SPEC
        saved = dict(SPEC)
        SPEC.clear(); SPEC.update({"paths": {}})
        try:
            ctl = rc.ReplayControl(f"http://127.0.0.1:{self.port}", "x" * 24)
            Handler.commands = [{"id": "c2", "time": 10}]
            ctl.poll_once()
            self.assertEqual(Handler.reports[0]["status"], "failed")
        finally:
            SPEC.clear(); SPEC.update(saved)

    def test_focus_plan_and_resolution(self):
        plan = rc.guess_focus_plan(SPEC)
        self.assertEqual(plan["path"], "/rest/watch/focus/{slot}")
        self.assertEqual(plan["where"], "path")
        cars = [{"id": 3, "num": 50, "driver": "Lena Vogt"}, {"id": 7, "num": 8, "driver": "Max Becker"}]
        self.assertEqual(rc.resolve_car(cars, 8, None)["id"], 7)
        self.assertEqual(rc.resolve_car(cars, None, "lena vogt")["id"], 3)
        self.assertEqual(rc.resolve_car(cars, 99, "Max Becker")["id"], 7)  # Nummer unbekannt, Name passt
        self.assertIsNone(rc.resolve_car(cars, 99, "Niemand"))
        self.assertEqual(rc.focus_value({"by": "number"}, None, 12, None), 12)
        self.assertEqual(rc.focus_value({"by": "name"}, None, None, "X"), "X")
        self.assertEqual(rc.build_focus_call(plan, 3), ("POST", "/rest/watch/focus/3", None))

    def test_jump_then_focus_end_to_end(self):
        ctl = rc.ReplayControl(f"http://127.0.0.1:{self.port}", "x" * 24, focus_delay_s=0)
        ctl.set_cars([{"id": 3, "num": 50, "driver": "Lena Vogt"}])
        Handler.commands = [{"id": "c9", "time": 100.0, "car": 50, "driver": "Lena Vogt"}]
        ctl.poll_once()
        self.assertEqual(Handler.log, ["/rest/replay/seek?time=100", "/rest/watch/focus/3"])
        self.assertEqual(Handler.reports[0]["status"], "done")
        self.assertIn("Kamera auf #50", Handler.reports[0]["message"])

    def test_focus_unknown_car_keeps_jump_ok(self):
        ctl = rc.ReplayControl(f"http://127.0.0.1:{self.port}", "x" * 24, focus_delay_s=0)
        ctl.set_cars([])
        Handler.commands = [{"id": "c10", "time": 5.0, "car": 77, "driver": "Nobody"}]
        ctl.poll_once()
        self.assertEqual(Handler.log, ["/rest/replay/seek?time=5"])
        self.assertEqual(Handler.reports[0]["status"], "done")
        self.assertIn("nicht in den Spieldaten", Handler.reports[0]["message"])

    def test_focus_override_by_number(self):
        ctl = rc.ReplayControl(f"http://127.0.0.1:{self.port}", "x" * 24, focus_delay_s=0,
                               focus_override={"path": "/custom/cam", "method": "POST", "param": "car", "where": "query", "by": "number"})
        ok, msg = ctl.focus(12, None)
        self.assertTrue(ok)
        self.assertEqual(Handler.log, ["/custom/cam?car=12"])

    def test_override_from_config(self):
        ctl = rc.ReplayControl(f"http://127.0.0.1:{self.port}", "x" * 24, {"path": "/custom", "method": "POST", "param": "t", "where": "query", "scale": 1000})
        ok, _ = ctl.jump(5)
        self.assertTrue(ok)
        self.assertEqual(Handler.log, ["/custom?t=5000"])


if __name__ == "__main__":
    unittest.main()
