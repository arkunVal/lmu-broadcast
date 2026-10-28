"""
Reader-Key: ein einziger Text, der alle Einstellungen des Readers enthaelt.
Die Website erzeugt ihn im Event unter "Einstellungen". Du fuegst ihn beim ersten Start
des Readers ein, danach merkt sich der Reader ihn in config.json.

Format:  LMU1.<base64url(JSON)>
JSON:    supabase_url, anon_key, room, site_url, ingest_token
"""

from __future__ import annotations

import base64
import json

PREFIX = "LMU1."
FIELDS = ("supabase_url", "anon_key", "room", "site_url", "ingest_token")


def encode_key(values: dict) -> str:
    data = {k: values[k] for k in FIELDS if values.get(k)}
    raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return PREFIX + base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_key(text: str) -> dict:
    """Gibt die Einstellungen zurueck oder wirft ValueError mit verstaendlicher Meldung."""
    text = (text or "").strip().strip('"').strip()
    if not text.startswith(PREFIX):
        raise ValueError("Das ist kein Reader-Key (er beginnt mit LMU1.)")
    body = text[len(PREFIX):]
    try:
        raw = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
        data = json.loads(raw.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Reader-Key ist beschaedigt. Bitte erneut kopieren (komplett, ohne Leerzeichen).") from exc
    if not isinstance(data, dict):
        raise ValueError("Reader-Key hat ein unerwartetes Format")
    missing = [k for k in ("supabase_url", "anon_key", "room") if not data.get(k)]
    if missing:
        raise ValueError("Reader-Key unvollstaendig, es fehlt: " + ", ".join(missing))
    return {k: data[k] for k in FIELDS if data.get(k)}
