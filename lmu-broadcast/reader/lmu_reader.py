"""
LMU Broadcast Reader
====================
Liest die Shared-Memory-Daten von Le Mans Ultimate (nur Windows) und schickt sie
mehrmals pro Sekunde an Supabase Realtime, damit die Website sie live anzeigen kann.

Start:
    py lmu_reader.py              # echtes Spiel
    py lmu_reader.py --demo       # Fake-Daten, Spiel nicht noetig
    py lmu_reader.py --dry-run    # liest und zeigt an, sendet aber nichts
"""

from __future__ import annotations

import argparse
import ctypes
import json
import sys
import time
from pathlib import Path

from demo import demo_payload
from payload import build_payload
from pylmu.lmu_data import LMUConstants, LMUObjectOut
from sender import Sender

HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG = HERE / "config.json"


class WindowsSource:
    """Liest den benannten Speicherbereich 'LMU_Data' des Spiels."""

    def __init__(self):
        import mmap

        self._mmap_module = mmap
        self._size = ctypes.sizeof(LMUObjectOut)
        self._mm = None
        self.open()

    def open(self):
        self.close()
        self._mm = self._mmap_module.mmap(
            -1, self._size, tagname=LMUConstants.LMU_SHARED_MEMORY_FILE
        )

    def read(self) -> LMUObjectOut:
        # Kopie (Snapshot), damit sich die Daten waehrend der Auswertung nicht aendern
        return LMUObjectOut.from_buffer_copy(self._mm)

    def close(self):
        if self._mm is not None:
            try:
                self._mm.close()
            except Exception:
                pass
            self._mm = None


class FileSource:
    """Entwickler-Hilfe: liest einen gespeicherten Speicherabzug aus einer Datei."""

    def __init__(self, path: str):
        self._path = path

    def open(self):
        pass

    def read(self) -> LMUObjectOut:
        return LMUObjectOut.from_buffer_copy(Path(self._path).read_bytes())

    def close(self):
        pass


def load_config(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def parse_args():
    p = argparse.ArgumentParser(description="LMU Broadcast Reader")
    p.add_argument("--demo", action="store_true", help="Fake-Daten statt Spieldaten senden")
    p.add_argument("--dry-run", action="store_true", help="nichts ins Internet senden")
    p.add_argument("--config", default=str(DEFAULT_CONFIG), help="Pfad zur config.json")
    p.add_argument("--room", help="Raumcode (ueberschreibt config.json)")
    p.add_argument("--rate", type=float, help="Sendungen pro Sekunde (ueberschreibt config.json)")
    p.add_argument("--from-file", help="(Entwickler) Speicherabzug aus Datei lesen")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    cfg = load_config(Path(args.config))

    room = args.room or cfg.get("room")
    rate = args.rate or cfg.get("rate_hz") or 5
    url = cfg.get("supabase_url")
    key = cfg.get("anon_key")

    if not args.dry_run and not (url and key and room):
        print("FEHLER: config.json fehlt oder ist unvollstaendig.")
        print("Kopiere config.example.json nach config.json und trage supabase_url, anon_key und room ein.")
        print("Zum Ausprobieren ohne Internet: py lmu_reader.py --dry-run")
        return 1

    if not args.demo:
        if args.from_file:
            source = FileSource(args.from_file)
        elif sys.platform == "win32":
            source = WindowsSource()
        else:
            print("Der echte Reader funktioniert nur unter Windows. Nutze --demo zum Testen.")
            return 1
    else:
        source = None

    topic = f"lmu-{room or 'dryrun'}"
    sender = Sender(url or "https://example.invalid", key or "", topic, dry_run=args.dry_run)
    sender.start()

    interval = 1.0 / max(0.5, min(float(rate), 20.0))
    print(f"Reader gestartet | Raum: {room} | {1 / interval:.1f} Pakete/s | Strg+C zum Beenden")

    demo_start = time.time()
    idle_ticks = 0
    last_status = 0.0
    next_tick = time.perf_counter()

    try:
        while True:
            if args.demo:
                payload = demo_payload(demo_start)
            else:
                payload = build_payload(source.read())

            # Solange kein Spiel laeuft, nur selten senden (spart Nachrichten)
            if payload["status"] == "idle":
                idle_ticks += 1
                if idle_ticks % int(max(1, 1.0 / interval) * 2) == 1:
                    sender.submit(payload)
                if idle_ticks % int(max(1, 1.0 / interval) * 10) == 0:
                    source.open()  # Verbindung erneuern, falls das Spiel inzwischen gestartet ist
            else:
                idle_ticks = 0
                sender.submit(payload)

            now = time.perf_counter()
            if now - last_status >= 2.0:
                last_status = now
                s = payload["session"]
                state = "LIVE" if payload["status"] == "live" else "wartet auf Spiel"
                net = "trocken (kein Senden)" if args.dry_run else (
                    f"OK {sender.last_ms} ms" if sender.last_error is None and sender.sent else
                    (sender.last_error or "...")
                )
                print(
                    f"[{state}] {s['track'] or '-'} | Autos: {s['cars']} | "
                    f"Paket: {sender.last_bytes / 1024:.1f} KB | gesendet: {sender.sent} | "
                    f"Fehler: {sender.failed} | Netz: {net}"
                )
                if args.dry_run and payload["cars"]:
                    c = payload["cars"][0]
                    print("  Beispiel Auto 1:", json.dumps(c, ensure_ascii=False))

            next_tick += interval
            delay = next_tick - time.perf_counter()
            if delay > 0:
                time.sleep(delay)
            else:
                next_tick = time.perf_counter()
    except KeyboardInterrupt:
        print("\nBeendet.")
    finally:
        if source is not None:
            source.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
