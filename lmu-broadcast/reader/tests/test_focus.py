import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from focus import FocusTracker, parse_focus  # noqa: E402

CARS = [{"id": 3, "driver": "Lena Vogt"}, {"id": 7, "driver": "Max Becker"}]


class FocusTests(unittest.TestCase):
    def test_parse_list_with_flag(self):
        self.assertEqual(parse_focus('[{"slotID":3,"focus":false},{"slotID":7,"focus":true}]', CARS), 7)

    def test_parse_by_name(self):
        self.assertEqual(parse_focus('[{"driverName":"Lena Vogt","isFocused":true}]', CARS), 3)

    def test_parse_plain_and_unknown(self):
        self.assertEqual(parse_focus('{"slotID": 7}', CARS), 7)
        self.assertIsNone(parse_focus('[{"slotID":9,"focus":true}]', CARS))
        self.assertIsNone(parse_focus("nix", CARS))

    def test_priority(self):
        ft = FocusTracker()
        p = {"cars": CARS, "session": {"focusId": 3}}
        ft.apply(p)
        self.assertEqual((p["session"]["focusId"], p["session"]["focusSrc"]), (3, "memory"))
        ft.note_command(7)
        ft.apply(p)
        self.assertEqual((p["session"]["focusId"], p["session"]["focusSrc"]), (7, "command"))
        import time
        ft._rest = (3, time.time())
        ft.apply(p)
        self.assertEqual(p["session"]["focusSrc"], "game")


if __name__ == "__main__":
    unittest.main()
