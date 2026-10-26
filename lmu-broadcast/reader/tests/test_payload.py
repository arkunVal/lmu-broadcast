"""Prueft die Umrechnung mit einem kuenstlich gefuellten Speicherabbild.
Start (im Ordner reader):  python -m unittest discover tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from payload import build_payload, car_number  # noqa: E402
from pylmu.lmu_data import LMUObjectOut  # noqa: E402


def make_data():
    d = LMUObjectOut()
    info = d.scoring.scoringInfo
    info.mTrackName = b"Circuit de la Sarthe"
    info.mLapDist = 13626.0
    info.mNumVehicles = 2
    info.mGamePhase = 5
    info.mSectorFlag[1] = 1
    v = d.scoring.vehScoringInfo[0]
    v.mID = 7
    v.mDriverName = b"Max Becker"
    v.mVehicleName = b"Toyota GR010 #8"
    v.mVehicleClass = b"Hypercar"
    v.mPlace = 1
    v.mLapDist = 6813.0
    v.mLocalVel.z = 50.0
    v.mLastLapTime = 205.5
    v.mLastSector1 = 60.0
    v.mLastSector2 = 130.0
    v.mBestLapTime = -1.0
    v.mSector = 0
    w = d.scoring.vehScoringInfo[1]
    w.mID = 9
    w.mDriverName = b"Stehendes Auto"
    w.mVehicleName = b"Oreca 07 #28"
    w.mPlace = 2
    w.mLocalVel.z = 0.0
    d.telemetry.activeVehicles = 1
    t = d.telemetry.telemInfo[0]
    t.mID = 7
    t.mFrontTireCompoundName = b"Medium"
    t.mRearTireCompoundName = b"Medium"
    t.mWheels[0].mCompoundType = 1
    return d


class PayloadTest(unittest.TestCase):
    def test_basics(self):
        p = build_payload(make_data(), now_ms=1)
        self.assertEqual(p["status"], "live")
        self.assertEqual(p["session"]["track"], "Circuit de la Sarthe")
        self.assertEqual(len(p["cars"]), 2)
        c = p["cars"][0]
        self.assertEqual(c["driver"], "Max Becker")
        self.assertEqual(c["num"], 8)
        self.assertAlmostEqual(c["speedKmh"], 180.0, places=1)
        self.assertAlmostEqual(c["lapFrac"], 0.5, places=3)
        self.assertEqual(c["sector"], 3)
        self.assertEqual(c["lastS1"], 60.0)
        self.assertEqual(c["lastS2"], 70.0)
        self.assertEqual(c["lastS3"], 75.5)
        self.assertIsNone(c["bestLap"])
        self.assertEqual(c["tire"]["compound"], "Medium")

    def test_yellow_cause(self):
        cars = build_payload(make_data(), now_ms=1)["cars"]
        self.assertFalse(cars[0]["yellowCause"])
        self.assertTrue(cars[1]["yellowCause"])
        self.assertIsNone(cars[1]["tire"])

    def test_idle(self):
        p = build_payload(LMUObjectOut(), now_ms=1)
        self.assertEqual(p["status"], "idle")
        self.assertEqual(p["cars"], [])

    def test_car_number(self):
        self.assertEqual(car_number("Team X #12"), 12)
        self.assertIsNone(car_number("Team X"))


if __name__ == "__main__":
    unittest.main()
