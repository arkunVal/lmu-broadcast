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
    t.mVirtualEnergy = 0.8
    d.telemetry.playerHasVehicle = True
    d.telemetry.playerVehicleIdx = 0
    t.mFrontTireCompoundName = b"Medium"
    t.mRearTireCompoundName = b"Medium"
    # links Medium, rechts Soft (VL, VR, HL, HR)
    for k, c in enumerate((1, 0, 1, 0)):
        t.mWheels[k].mCompoundType = c
    return d


class PayloadTest(unittest.TestCase):
    def test_energy_and_focus(self):
        p = build_payload(make_data(), now_ms=1)
        self.assertAlmostEqual(p["cars"][0]["energy"], 0.8, places=2)
        self.assertIsNone(p["cars"][1]["energy"])
        self.assertEqual(p["session"]["focusId"], 7)

    def test_basics(self):
        p = build_payload(make_data(), now_ms=1)
        self.assertEqual(p["status"], "live")
        self.assertEqual(p["session"]["track"], "Circuit de la Sarthe")
        self.assertEqual(len(p["cars"]), 2)
        c = p["cars"][0]
        self.assertEqual(c["driver"], "Max Becker")
        self.assertEqual(c["num"], "8")
        self.assertAlmostEqual(c["speedKmh"], 180.0, places=1)
        self.assertAlmostEqual(c["lapFrac"], 0.5, places=3)
        self.assertEqual(c["sector"], 3)
        self.assertEqual(c["lastS1"], 60.0)
        self.assertEqual(c["lastS2"], 70.0)
        self.assertEqual(c["lastS3"], 75.5)
        self.assertIsNone(c["bestLap"])
        self.assertEqual(c["tire"]["compound"], "Medium")
        self.assertEqual(c["tire"]["wheels"], ["Medium", "Soft", "Medium", "Soft"])

    def test_yellow_cause(self):
        cars = build_payload(make_data(), now_ms=1)["cars"]
        self.assertFalse(cars[0]["yellowCause"])
        self.assertTrue(cars[1]["yellowCause"])
        self.assertIsNone(cars[1]["tire"])

    def test_training_yellow_needs_stopped_car_on_track(self):
        d = make_data()
        d.scoring.vehScoringInfo[1].mInPits = True          # steht nur in der Box
        s = build_payload(d, now_ms=1)
        self.assertEqual(s["session"]["sectorFlags"], [0, 0, 0])
        self.assertFalse(s["cars"][1]["yellowCause"])
        d = make_data()                                       # steht auf der Strecke: Gelb bleibt
        self.assertEqual(build_payload(d, now_ms=1)["session"]["sectorFlags"], [0, 1, 0])
        d = make_data()
        d.scoring.vehScoringInfo[1].mInPits = True
        d.scoring.scoringInfo.mSession = 10                   # Rennen: Meldung des Spiels bleibt
        self.assertEqual(build_payload(d, now_ms=1)["session"]["sectorFlags"], [0, 1, 0])

    def test_idle(self):
        p = build_payload(LMUObjectOut(), now_ms=1)
        self.assertEqual(p["status"], "idle")
        self.assertEqual(p["cars"], [])

    def test_car_number(self):
        self.assertEqual(car_number("Team X #12"), "12")
        self.assertEqual(car_number("Team X #007"), "007")
        self.assertNotEqual(car_number("A #07"), car_number("A #7"))
        self.assertIsNone(car_number("Team X"))


if __name__ == "__main__":
    unittest.main()
