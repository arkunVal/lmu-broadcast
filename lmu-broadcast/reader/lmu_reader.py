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

from auto_track import AutoTrack
from replay_control import ReplayControl, dump_endpoints, probe_commands
from demo import demo_hint, demo_payload
from hint_sender import HintSender
from hints import HintDetector
from payload import build_payload
from pylmu.lmu_data import LMUConstants, LMUObjectOut
from reader_key import decode_key
from sender import Sender
from track_recorder import TrackRecorder

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


def ask_for_key(path: Path) -> dict:
    """Erster Start: Reader-Key der Website abfragen und in config.json merken."""
    print("Einrichtung: Oeffne dein Event auf der Website, Reiter 'Einstellungen', kopiere den Reader-Key")
    print("und fuege ihn hier ein (Rechtsklick = einfuegen), dann Enter.")
    while True:
        try:
            text = input("Reader-Key: ")
        except (EOFError, KeyboardInterrupt):
            return {}
        try:
            values = decode_key(text)
            break
        except ValueError as exc:
            print("  ->", exc)
    with path.open("w", encoding="utf-8") as fh:
        json.dump({"reader_key": text.strip().strip('"')}, fh, indent=2)
    print("Gespeichert in", path.name, "- beim naechsten Start kein Einfuegen mehr noetig.\n")
    return values


def resolve_config(cfg: dict) -> dict:
    """reader_key aus config.json auspacken. Einzelne Felder in config.json haben Vorrang."""
    key = cfg.get("reader_key")
    if not key:
        return cfg
    merged = dict(decode_key(key))
    merged.update({k: v for k, v in cfg.items() if k != "reader_key" and v not in (None, "")})
    return merged


def record_track(args) -> int:
    """Nimmt den Streckenverlauf auf und legt ihn als Datei ab (kein Versand ins Internet)."""
    if sys.platform != "win32" and not args.from_file:
        print("Die Aufnahme funktioniert nur unter Windows mit laufendem Spiel.")
        return 1
    source = FileSource(args.from_file) if args.from_file else WindowsSource()
    recorder = TrackRecorder()
    web_tracks = HERE.parent / "web" / "public" / "tracks"
    target = web_tracks if web_tracks.parent.exists() else HERE / "tracks"
    print("Streckenaufnahme gestartet. Fahre im Spiel EINE komplette Runde (Training genuegt). Strg+C bricht ab.")
    last = 0.0
    try:
        while not recorder.done:
            status = recorder.update(source.read())
            now = time.perf_counter()
            if now - last >= 2.0:
                last = now
                print(" ", status)
            time.sleep(0.1)
        path = recorder.save(target)
        print(f"FERTIG: {path}")
        print("Lade diese Datei in dein GitHub-Projekt hoch (web/public/tracks/). Vercel baut danach neu.")
    except KeyboardInterrupt:
        print("\nAbgebrochen, nichts gespeichert.")
    finally:
        source.close()
    return 0


def parse_args():
    p = argparse.ArgumentParser(description="LMU Broadcast Reader")
    p.add_argument("--demo", action="store_true", help="Fake-Daten statt Spieldaten senden")
    p.add_argument("--dry-run", action="store_true", help="nichts ins Internet senden")
    p.add_argument("--config", default=str(DEFAULT_CONFIG), help="Pfad zur config.json")
    p.add_argument("--room", help="Raumcode (ueberschreibt config.json)")
    p.add_argument("--rate", type=float, help="Sendungen pro Sekunde (ueberschreibt config.json)")
    p.add_argument("--record-track", action="store_true", help="Streckenverlauf fuer die Streckenkarte aufnehmen (eine Runde fahren)")
    p.add_argument("--replay-probe", action="store_true", help="Replay-Befehle (Play, Pause ...) im Spiel durchprobieren und Antworten zeigen")
    p.add_argument("--replay-endpoints", action="store_true", help="alle Replay-Endpunkte des Spiels anzeigen (fuer den Replay-Sprung-Knopf)")
    p.add_argument("--hints-debug", action="store_true", help="Vorfall-Hinweise samt Rohwerten in der Konsole zeigen")
    p.add_argument("--demo-hints", action="store_true", help="im Demo-Modus gelegentlich einen Fake-Hinweis erzeugen")
    p.add_argument("--from-file", help="(Entwickler) Speicherabzug aus Datei lesen")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.replay_probe:
        return probe_commands()
    if args.replay_endpoints:
        return dump_endpoints()
    if args.record_track:
        return record_track(args)

    cfg_path = Path(args.config)
    cfg = load_config(cfg_path)
    if not cfg and not args.dry_run and not args.demo:
        cfg = ask_for_key(cfg_path) and load_config(cfg_path)
    try:
        cfg = resolve_config(cfg)
    except ValueError as exc:
        print("FEHLER in config.json:", exc)
        return 1

    room = args.room or cfg.get("room")
    send_hz = max(0.5, min(float(args.rate or cfg.get("rate_hz") or 5), 20.0))
    read_hz = max(send_hz, min(float(cfg.get("read_hz") or 10), 20.0))
    url = cfg.get("supabase_url")
    key = cfg.get("anon_key")
    site_url = cfg.get("site_url")
    ingest_token = cfg.get("ingest_token")

    if not args.dry_run and not (url and key and room):
        print("FEHLER: Einstellungen fehlen. Loesche config.json und starte neu, dann fragt der Reader nach dem Reader-Key.")
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

    # Vorfall-Hinweise (Rennleitung): nur mit site_url + ingest_token, oder zum Kalibrieren mit --hints-debug
    detector = None
    hint_sender = None
    if (site_url and ingest_token) or args.hints_debug:
        detector = HintDetector(cfg.get("hints"), debug=args.hints_debug)
    if site_url and ingest_token and not args.dry_run:
        hint_sender = HintSender(site_url, ingest_token)
        hint_sender.start()
    elif detector is not None and not args.hints_debug:
        print("Hinweis: Vorfall-Hinweise werden erkannt, aber nicht gesendet (dry-run).")

    # Streckenkarte automatisch aufnehmen und hochladen (nur mit site_url + ingest_token)
    auto_track = None
    if site_url and ingest_token and not args.dry_run and not args.demo and not args.from_file:
        auto_track = AutoTrack(site_url, ingest_token)

    # Replay-Sprung-Knopf der Website (nur mit echtem Spiel)
    replay = None
    if site_url and ingest_token and not args.dry_run and not args.demo and not args.from_file:
        replay = ReplayControl(site_url, ingest_token, cfg.get("replay_jump"), focus_override=cfg.get("replay_focus"), transport=cfg.get("replay_transport"))
        replay.start()

    interval = 1.0 / read_hz
    send_interval = 1.0 / send_hz
    print(
        f"Reader gestartet | Raum: {room} | lesen {read_hz:.0f}/s, senden {send_hz:.1f}/s | "
        f"Rennleitungs-Hinweise: {'AN' if hint_sender else ('nur Debug' if detector else 'aus')} | Strg+C zum Beenden"
    )

    demo_start = time.time()
    idle_ticks = 0
    last_status = 0.0
    last_send = 0.0
    last_idle_send = 0.0
    last_demo_hint = time.time()
    next_tick = time.perf_counter()
    payload = None

    try:
        while True:
            now = time.perf_counter()
            data = None
            if args.demo:
                payload = demo_payload(demo_start)
            else:
                data = source.read()
                payload = build_payload(data) if now - last_send >= send_interval or payload is None else payload
                if replay is not None:
                    replay.set_cars(payload["cars"])

            # Vorfall-Hinweise: bei jedem Lese-Takt
            if detector is not None and data is not None:
                hints = detector.update(data)
                if hints and hint_sender is not None:
                    hint_sender.submit(hints)
            if auto_track is not None and data is not None:
                auto_track.update(data)
            if args.demo and args.demo_hints and hint_sender is not None and time.time() - last_demo_hint > 30:
                last_demo_hint = time.time()
                hint_sender.submit([demo_hint(payload)])

            if payload["status"] == "idle":
                idle_ticks += 1
                # Solange kein Spiel laeuft, nur alle 2 s senden (spart Nachrichten)
                if now - last_idle_send >= 2.0:
                    last_idle_send = now
                    sender.submit(payload)
                if idle_ticks % int(read_hz * 10) == 0:
                    source.open()  # Verbindung erneuern, falls das Spiel inzwischen gestartet ist
            else:
                idle_ticks = 0
                if now - last_send >= send_interval:
                    last_send = now
                    sender.submit(payload)

            if now - last_status >= 2.0:
                last_status = now
                s = payload["session"]
                state = "LIVE" if payload["status"] == "live" else "wartet auf Spiel"
                net = "trocken (kein Senden)" if args.dry_run else (
                    f"OK {sender.last_ms} ms" if sender.last_error is None and sender.sent else
                    (sender.last_error or "...")
                )
                hint_info = ""
                if detector is not None:
                    hint_info = f" | Hinweise: {detector.detected} erkannt"
                    if hint_sender is not None:
                        hint_info += f", {hint_sender.inserted} gespeichert"
                        if hint_sender.last_error:
                            hint_info += f" (FEHLER: {hint_sender.last_error})"
                print(
                    f"[{state}] {s['track'] or '-'} | Autos: {s['cars']} | "
                    f"Paket: {sender.last_bytes / 1024:.1f} KB | gesendet: {sender.sent} | "
                    f"Fehler: {sender.failed} | Netz: {net}{hint_info}"
                )
                if auto_track is not None and payload["status"] == "live":
                    print("  " + auto_track.summary())
                if args.dry_run and payload["cars"] and not args.hints_debug:
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
