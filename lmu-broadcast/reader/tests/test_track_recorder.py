"""Test der Streckenaufnahme mit einem kuenstlichen Rundkurs.
Start (im Ordner reader):  python -m unittest discover tests
"""
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylmu.lmu_data import LMUObjectOut  # noqa: E402
from track_recorder import BINS, TrackRecorder, track_slug  # noqa: E402

LENGTH = 5000.0


def frame(dist, pits=False, speed=60.0, track=b"Test Track 1"):
    d = LMUObjectOut()
    info = d.scoring.scoringInfo
    info.mTrackName = track
    info.mLapDist = LENGTH
    info.mNumVehicles = 1
    v = d.scoring.vehScoringInfo[0]
    v.mIsPlayer = True
    v.mInPits = pits
    v.mLapDist = dist
    a = dist / LENGTH * 2 * math.pi
    v.mPos.x = math.cos(a) * 800.0
    v.mPos.z = math.sin(a) * 400.0
    v.mLocalVel.z = speed
    return d


class RecorderTest(unittest.TestCase):
    def test_slug(self):
        self.assertEqual(track_slug("Circuit de la Sarthe"), "circuit-de-la-sarthe")
        self.assertEqual(track_slug("  Spa-Francorchamps (GP) "), "spa-francorchamps-gp")

    def test_records_one_lap_and_saves(self):
        rec = TrackRecorder()
        d = 0.0
        while not rec.done and d < LENGTH * 1.2:
            rec.update(frame(d))
            d += 7.0
        self.assertTrue(rec.done)
        with tempfile.TemporaryDirectory() as tmp:
            path = rec.save(Path(tmp))
            self.assertEqual(path.name, "test-track-1.json")
            data = json.loads(path.read_text())
            self.assertEqual(data["name"], "Test Track 1")
            self.assertEqual(len(data["points"]), BINS)
            # Punkt 0 liegt auf (800, 0)
            self.assertAlmostEqual(data["points"][0][0], 800.0, delta=5)

    def test_ignores_pits_and_standing(self):
        rec = TrackRecorder()
        for i in range(200):
            rec.update(frame(i * 10.0, pits=True))
            rec.update(frame(i * 10.0, speed=1.0))
        self.assertEqual(rec.filled, 0.0)

    def test_idle_without_game(self):
        self.assertIn("wartet", TrackRecorder().update(LMUObjectOut()))


if __name__ == "__main__":
    unittest.main()
