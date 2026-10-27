"""Tests fuer die automatischen Vorfall-Hinweise (synthetische Frames).
Start (im Ordner reader):  python -m unittest discover tests
"""
import http.server
import json
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hint_sender import HintSender  # noqa: E402
from hints import HintDetector  # noqa: E402
from pylmu.lmu_data import LMUObjectOut  # noqa: E402


def frame(et, cars, phase=5, telemetry=None):
    """cars: Liste von dicts mit Feldern fuer vehScoringInfo; telemetry: {mID: dict}."""
    d = LMUObjectOut()
    info = d.scoring.scoringInfo
    info.mTrackName = b"Test"
    info.mSession = 10
    info.mStartET = 100.0
    info.mCurrentET = et
    info.mGamePhase = phase
    info.mNumVehicles = len(cars)
    for i, c in enumerate(cars):
        v = d.scoring.vehScoringInfo[i]
        v.mID = c["id"]
        v.mDriverName = c.get("name", f"Fahrer{c['id']}").encode()
        v.mVehicleName = f"Team #{c['id']}".encode()
        v.mVehicleClass = b"Hypercar"
        v.mPos.x = c.get("x", 0.0)
        v.mPos.z = c.get("z", 0.0)
        v.mLocalVel.z = c.get("vz", 50.0)  # 180 km/h
        v.mLocalVel.x = c.get("vx", 0.0)
        v.mPathLateral = c.get("lat", 0.0)
        v.mTrackEdge = c.get("edge", 6.0)
        v.mInPits = c.get("pits", False)
        v.mLocalAccel.x = c.get("ax", 0.0)
    telemetry = telemetry or {}
    d.telemetry.activeVehicles = len(telemetry)
    for i, (cid, t) in enumerate(telemetry.items()):
        tl = d.telemetry.telemInfo[i]
        tl.mID = cid
        tl.mElapsedTime = et
        tl.mDeltaTime = 0.02
        for w in range(4):
            tl.mWheels[w].mSurfaceType = t.get("surface", 0)
        tl.mLastImpactET = t.get("impact_et", 0.0)
        tl.mLastImpactMagnitude = t.get("impact_mag", 0.0)
        tl.mTrackLimitsSteps = t.get("steps", 0)
    return d


def run(det, frames):
    out = []
    for f in frames:
        out.extend(det.update(f))
    return out


class HintTests(unittest.TestCase):
    def test_offtrack_lateral(self):
        det = HintDetector()
        frames = [frame(10.0 + i * 0.5, [{"id": 1, "lat": 8.0 if 2 <= i <= 6 else 0.0}]) for i in range(12)]
        hints = run(det, frames)
        self.assertEqual(len(hints), 1)
        h = hints[0]
        self.assertEqual(h["kind"], "offtrack")
        self.assertEqual(h["confidence"], "low")
        self.assertEqual(h["details"]["source"], "lateral")
        self.assertGreater(h["details"]["durationS"], 1.5)
        self.assertEqual(h["drivers"][0]["name"], "Fahrer1")
        self.assertEqual(h["drivers"][0]["num"], 1)

    def test_offtrack_wheels(self):
        det = HintDetector()
        frames = []
        for i in range(12):
            off = 2 <= i <= 6
            frames.append(frame(10.0 + i * 0.5, [{"id": 1}], telemetry={1: {"surface": 2 if off else 0}}))
        hints = run(det, frames)
        self.assertEqual(len(hints), 1)
        self.assertEqual(hints[0]["details"]["source"], "wheels")
        self.assertEqual(hints[0]["confidence"], "medium")

    def test_offtrack_too_short(self):
        det = HintDetector()
        frames = [frame(10.0 + i * 0.5, [{"id": 1, "lat": 8.0 if i == 2 else 0.0}]) for i in range(8)]
        self.assertEqual(run(det, frames), [])

    def test_offtrack_slow_ignored(self):
        det = HintDetector()
        frames = [frame(10.0 + i * 0.5, [{"id": 1, "vz": 5.0, "lat": 8.0 if 2 <= i <= 6 else 0.0}]) for i in range(12)]
        self.assertEqual(run(det, frames), [])

    def test_track_limits(self):
        det = HintDetector()
        frames = [
            frame(10.0, [{"id": 1}], telemetry={1: {"steps": 0}}),
            frame(10.5, [{"id": 1}], telemetry={1: {"steps": 0}}),
            frame(11.0, [{"id": 1}], telemetry={1: {"steps": 2}}),
        ]
        hints = run(det, frames)
        self.assertEqual([h["kind"] for h in hints], ["track_limits"])
        self.assertEqual(hints[0]["confidence"], "high")

    def test_spin_alone(self):
        det = HintDetector()
        frames = [frame(10.0 + i * 0.5, [{"id": 1, "vx": 30.0, "vz": 20.0}]) for i in range(4)]
        hints = run(det, frames)
        self.assertEqual([h["kind"] for h in hints], ["spin"])

    def test_contact_by_slide_near_other_car(self):
        det = HintDetector()
        frames = [
            frame(10.0 + i * 0.5, [{"id": 1, "vx": 30.0, "vz": 20.0}, {"id": 2, "x": 4.0, "z": 3.0}])
            for i in range(4)
        ]
        hints = run(det, frames)
        self.assertEqual(len(hints), 1)
        self.assertEqual(hints[0]["kind"], "contact")
        roles = {d["name"]: d["role"] for d in hints[0]["drivers"]}
        self.assertEqual(roles, {"Fahrer1": "involved", "Fahrer2": "possible"})

    def test_contact_by_impact_time(self):
        det = HintDetector()
        cars = [{"id": 1}, {"id": 2, "x": 3.0, "z": 0.0}]
        frames = [
            frame(10.0, cars, telemetry={1: {"impact_et": 0.0}}),
            frame(10.5, cars, telemetry={1: {"impact_et": 10.4, "impact_mag": 500.0}}),
        ]
        hints = run(det, frames)
        self.assertEqual(len(hints), 1)
        self.assertEqual(hints[0]["kind"], "contact")
        self.assertEqual({d["role"] for d in hints[0]["drivers"]}, {"involved"})
        self.assertEqual(len(hints[0]["drivers"]), 2)

    def test_impact_wall_and_threshold(self):
        det = HintDetector()
        cars = [{"id": 1}]
        frames = [
            frame(10.0, cars, telemetry={1: {"impact_et": 0.0}}),
            frame(10.5, cars, telemetry={1: {"impact_et": 10.4, "impact_mag": 500.0}}),
            frame(20.0, cars, telemetry={1: {"impact_et": 10.4, "impact_mag": 500.0}}),
            frame(30.0, cars, telemetry={1: {"impact_et": 29.0, "impact_mag": 5.0}}),  # zu schwach
        ]
        hints = run(det, frames)
        self.assertEqual([h["kind"] for h in hints], ["impact"])

    def test_contact_by_accel_without_telemetry(self):
        det = HintDetector()
        cars = [{"id": 1, "ax": 120.0}, {"id": 2, "x": 3.0}]
        hints = run(det, [frame(10.0, cars), frame(10.5, cars)])
        self.assertEqual(len(hints), 1)
        self.assertEqual(hints[0]["kind"], "contact")
        self.assertEqual(hints[0]["confidence"], "low")

    def test_pit_car_and_non_green_ignored(self):
        det = HintDetector()
        frames = [frame(10.0 + i * 0.5, [{"id": 1, "pits": True, "lat": 8.0, "vx": 30.0}]) for i in range(10)]
        self.assertEqual(run(det, frames), [])
        det = HintDetector()
        frames = [frame(10.0 + i * 0.5, [{"id": 1, "vx": 30.0, "vz": 20.0}], phase=6) for i in range(6)]
        self.assertEqual(run(det, frames), [])

    def test_cooldown_and_single_hint_per_pair(self):
        det = HintDetector()
        cars = [{"id": 1, "vx": 30.0, "vz": 20.0}, {"id": 2, "x": 3.0, "vx": 30.0, "vz": 20.0}]
        hints = run(det, [frame(10.0 + i * 0.5, cars) for i in range(8)])
        self.assertEqual(len(hints), 1)  # beide Autos rutschen, trotzdem nur ein Hinweis fuer das Paar

    def test_same_frame_ignored(self):
        det = HintDetector()
        f = frame(10.0, [{"id": 1}])
        self.assertEqual(det.update(f), [])
        self.assertEqual(det.update(f), [])

    def test_key_is_stable(self):
        a = run(HintDetector(), [frame(10.0 + i * 0.5, [{"id": 1, "vx": 30.0, "vz": 20.0}]) for i in range(4)])
        b = run(HintDetector(), [frame(10.0 + i * 0.5, [{"id": 1, "vx": 30.0, "vz": 20.0}]) for i in range(4)])
        self.assertEqual(a[0]["key"], b[0]["key"])


class SenderTest(unittest.TestCase):
    def test_posts_batch_to_ingest(self):
        received = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                received.append((self.path, self.headers.get("x-ingest-token"), json.loads(body)))
                out = json.dumps({"inserted": 1, "duplicates": 0}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

            def log_message(self, *a):
                pass

        server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            sender = HintSender(f"http://127.0.0.1:{server.server_port}", "TOKEN42")
            sender.start()
            sender.submit([{"key": "k1", "kind": "offtrack"}])
            self.assertTrue(sender.wait_idle(5.0))
            self.assertEqual(len(received), 1)
            path, token, body = received[0]
            self.assertEqual(path, "/api/ingest")
            self.assertEqual(token, "TOKEN42")
            self.assertEqual(body["hints"][0]["key"], "k1")
            self.assertEqual(sender.inserted, 1)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
