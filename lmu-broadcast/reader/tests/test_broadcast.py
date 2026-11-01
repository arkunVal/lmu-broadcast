"""Prueft Klassen-Abstaende, Sekunden-Takt, Sektor-Durchfahrtszeiten. Start: python -m unittest discover tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from broadcast import BroadcastData  # noqa: E402


def car(i, cls, place, laps=5, frac=0.5, gap=0.0, best=None, **kw):
    c = {"id": i, "cls": cls, "place": place, "laps": laps, "lapFrac": frac, "gapLeader": gap, "bestLap": best,
         "lastLap": None, "lastS1": None, "lastS2": None, "lastS3": None, "curS1": None, "curS2": None, "lapStart": 100.0}
    c.update(kw)
    return c


def pl(cars, type_=10):
    return {"status": "live", "session": {"type": type_}, "cars": cars}


class RaceGaps(unittest.TestCase):
    def test_class_gaps_and_refresh(self):
        b = BroadcastData()
        cars = [car(1, "H", 1, gap=0), car(2, "H", 2, gap=2.0), car(3, "G", 3, gap=5.0), car(4, "H", 4, gap=7.5)]
        b.update(pl(cars), 0.0)
        by = {c["id"]: c for c in cars}
        self.assertEqual(by[4]["cGapLeader"], 7.5)
        self.assertEqual(by[4]["cGapAhead"], 5.5)
        self.assertEqual(by[4]["cPos"], 3)
        self.assertEqual(by[3]["cPos"], 1)  # eigene Klasse
        # innerhalb 1 s keine Aenderung
        cars2 = [car(1, "H", 1, gap=0), car(2, "H", 2, gap=3.0), car(3, "G", 3, gap=5.0), car(4, "H", 4, gap=7.5)]
        b.update(pl(cars2), 0.5)
        self.assertEqual({c["id"]: c for c in cars2}[2]["cGapLeader"], 2.0)
        cars3 = [car(1, "H", 1, gap=0), car(2, "H", 2, gap=3.0), car(3, "G", 3, gap=5.0), car(4, "H", 4, gap=7.5)]
        b.update(pl(cars3), 1.2)
        self.assertEqual({c["id"]: c for c in cars3}[2]["cGapLeader"], 3.0)

    def test_lapped(self):
        b = BroadcastData()
        cars = [car(1, "H", 1, laps=6, frac=0.9), car(2, "H", 2, laps=4, frac=0.2, gap=100.0)]
        b.update(pl(cars), 0.0)
        self.assertEqual(cars[1]["cLapsLeader"], 2)
        self.assertIsNone(cars[1]["cGapLeader"])


class QualiGaps(unittest.TestCase):
    def test_only_on_line_crossing(self):
        b = BroadcastData()
        cars = [car(1, "H", 1, laps=3, best=200.0), car(2, "H", 2, laps=3, best=201.0)]
        b.update(pl(cars, 5), 0.0)
        self.assertEqual(cars[1]["cGapLeader"], 1.0)
        # gleiche Rundenzahl, andere Zwischenwerte: unveraendert
        cars = [car(1, "H", 1, laps=3, best=200.0, curS1=50.0), car(2, "H", 2, laps=3, best=201.0)]
        b.update(pl(cars, 5), 3.0)
        self.assertEqual(cars[1]["cGapLeader"], 1.0)
        # Auto 2 faehrt ueber die Linie, neue Bestzeit
        cars = [car(1, "H", 1, laps=3, best=200.0), car(2, "H", 2, laps=4, best=199.5)]
        b.update(pl(cars, 5), 4.0)
        by = {c["id"]: c for c in cars}
        self.assertEqual(by[2]["cPos"], 1)
        self.assertEqual(by[1]["cGapLeader"], 0.5)


class Splits(unittest.TestCase):
    def test_splits_and_prev_lap(self):
        b = BroadcastData()
        c = car(1, "H", 1, laps=2, lapStart=100.0, curS1=30.0, curS2=35.0, lastLap=90.0)
        b.update(pl([c]), 0.0)
        self.assertEqual(c["splits"]["3"][:2], [130.0, 165.0])
        c2 = car(1, "H", 1, laps=3, lapStart=195.0, lastLap=95.0)
        b.update(pl([c2]), 1.0)
        self.assertEqual(c2["splits"]["3"][2], 195.0)  # 100 + 95
        self.assertEqual(c2["prevLap"], 90.0)

    def test_best_sectors(self):
        b = BroadcastData()
        c = car(1, "H", 1, lastS1=30.0)
        b.update(pl([c]), 0.0)
        c = car(1, "H", 1, lastS1=29.0)
        b.update(pl([c]), 0.1)
        self.assertEqual(c["bestS1"], 29.0)


if __name__ == "__main__":
    unittest.main()
