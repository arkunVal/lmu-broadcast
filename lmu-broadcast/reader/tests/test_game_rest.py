import json
import unittest

import game_rest as g

SPEC = {"paths": {
    "/rest/replay/isActive": {"get": {}},
    "/rest/replay/seek": {"post": {"parameters": [{"name": "time", "in": "query", "schema": {"type": "number"}}]}},
    "/rest/replay/camera": {"put": {"parameters": [{"name": "name", "in": "query", "schema": {"enum": ["Trackcycle", "Swingarm", "Cockpit"]}}]}},
    "/rest/garage/camera": {"put": {"parameters": [{"name": "name", "in": "query"}]}},
    "/rest/watch/focus/{slotid}": {"put": {}},
}}


class Fake:
    def __init__(self, replies):
        self.replies, self.calls = replies, []

    def __call__(self, method, path, body=None, timeout=2.0):
        self.calls.append((method, path))
        return self.replies.get((method, path.split("?")[0]), (200, "true"))


class SchemaTests(unittest.TestCase):
    def test_jump(self):
        p = g.guess_jump(SPEC)
        self.assertEqual((p["path"], p["method"], p["param"], p["where"]), ("/rest/replay/seek", "POST", "time", "query"))

    def test_camera_picks_replay_not_garage_and_enum(self):
        p = g.guess_camera(SPEC, "Swingarm")
        self.assertEqual(p["path"], "/rest/replay/camera")
        self.assertEqual(p["value"], "Swingarm")

    def test_lookup(self):
        self.assertEqual(g.lookup_value([{"id": 3, "name": "Swingarm"}, {"id": 1, "name": "Cockpit"}], "swingarm"), 3)
        self.assertEqual(g.lookup_value(["Cockpit", "Swingarm 2"], "Swingarm"), "Swingarm 2")
        self.assertIsNone(g.lookup_value([], "x"))

    def test_build_call(self):
        self.assertEqual(g.build_call({"path": "/a", "method": "post", "param": "t", "where": "query"}, 12.5), ("POST", "/a?t=12.5", None))
        self.assertEqual(g.build_call({"path": "/a/{id}", "param": "id", "where": "path"}, 4)[1], "/a/4")
        self.assertEqual(g.build_call({"path": "/a", "param": "t", "where": "body"}, 1)[2], {"t": 1})


class FocusTests(unittest.TestCase):
    def test_parse_focus(self):
        text = json.dumps([{"slotID": 4, "focus": False}, {"slotID": 9, "focus": True}])
        self.assertEqual(g.parse_focus(text, []), 9)
        self.assertIsNone(g.parse_focus("nope", []))

    def test_priority(self):
        t = g.FocusTracker(request=Fake({}))
        payload = {"cars": [{"id": 1}, {"id": 2}, {"id": 3}], "session": {"focusId": 1}}
        t.apply(payload)
        self.assertEqual((payload["session"]["focusId"], payload["session"]["focusSrc"]), (1, "memory"))
        t.note_command(2)
        t.apply(payload)
        self.assertEqual(payload["session"]["focusSrc"], "command")
        t._rest = (3, __import__("time").time())
        t.apply(payload)
        self.assertEqual((payload["session"]["focusId"], payload["session"]["focusSrc"]), (3, "game"))


class HandleTests(unittest.TestCase):
    def make(self, replies=None):
        f = Fake(replies or {})
        c = g.GameControl("https://x.test", "t" * 24, request=f)
        c._spec = SPEC
        c.set_cars([{"id": 7, "num": "007", "driver": "Max"}, {"id": 8, "num": "7", "driver": "Lena"}])
        orig = g.time.sleep
        g.time.sleep = lambda s: None
        self.addCleanup(setattr, g.time, "sleep", orig)
        return c, f

    def test_car_numbers_are_text(self):
        c, _ = self.make()
        self.assertEqual(c.car_id({"car_number": "007"}), 7)
        self.assertEqual(c.car_id({"car_number": "7"}), 8)
        self.assertEqual(c.car_id({"driver": "lena"}), 8)

    def test_jump_order_jump_then_focus_then_camera(self):
        c, f = self.make({("GET", "/rest/replay/isActive"): (200, "false")})
        ok, msg = c.handle({"kind": "jump", "target_time": 100.0, "car_number": "7"})
        self.assertTrue(ok, msg)
        paths = [p for _, p in f.calls]
        i_jump = next(i for i, p in enumerate(paths) if p.startswith("/rest/replay/seek"))
        i_focus = paths.index("/rest/watch/focus/8")
        i_cam = next(i for i, p in enumerate(paths) if p.startswith("/rest/replay/camera"))
        self.assertLess(i_jump, i_focus)
        self.assertLess(i_focus, i_cam)
        self.assertIn(("PUT", "/rest/replay/camera?name=Swingarm"), f.calls)
        self.assertIn(("POST", "/rest/replay/toggleactive"), f.calls)

    def test_live_only_toggles_when_active(self):
        c, f = self.make({("GET", "/rest/replay/isActive"): (200, "false")})
        self.assertTrue(c.handle({"kind": "live"})[0])
        self.assertNotIn(("POST", "/rest/replay/toggleactive"), f.calls)

    def test_unknown_and_missing(self):
        c, _ = self.make()
        self.assertFalse(c.handle({"kind": "x"})[0])
        self.assertFalse(c.handle({"kind": "focus", "car_number": "99"})[0])


if __name__ == "__main__":
    unittest.main()
