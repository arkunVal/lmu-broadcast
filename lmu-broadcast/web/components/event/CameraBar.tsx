"use client";

import { useEffect, useRef, useState } from "react";
import { comboOf, useCameraBar } from "@/lib/cameraBar";
import { sendCommand } from "@/lib/commands";
import { getSupabase } from "@/lib/supabase";

/**
 * Kamera-Leiste unten: ein Knopf pro Kamera, Hotkeys frei waehlbar (Zahnrad). Der Reader am Rennrechner stellt die Kamera
 * ueber die lokale Spiel-Schnittstelle. Hotkeys gelten, solange der Reiter "Broadcast" offen ist.
 */
export default function CameraBar({ eventId, who, enabled }: { eventId: string; who: { num: string | null; name: string; team: string } | null; enabled: boolean }) {
  const { cams, save, reset } = useCameraBar();
  const [active, setActive] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [edit, setEdit] = useState(false);
  const [capture, setCapture] = useState<number | null>(null);
  const busy = useRef(false);

  async function pick(name: string) {
    const supabase = getSupabase();
    if (!supabase || busy.current) return;
    busy.current = true;
    setMsg(null);
    const r = await sendCommand(supabase, eventId, { kind: "camera", name });
    if (r.ok) setActive(name);
    setMsg(r);
    busy.current = false;
  }

  // Hotkeys (nicht beim Tippen in Feldern, nicht beim Belegen einer Taste)
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (capture != null || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      const combo = comboOf(e);
      const cam = combo ? cams.find((c) => c.key === combo) : null;
      if (cam) { e.preventDefault(); void pick(cam.name); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Taste belegen
  useEffect(() => {
    if (capture == null) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapture(null); return; }
      const combo = e.key === "Backspace" || e.key === "Delete" ? "" : comboOf(e);
      if (!combo && e.key !== "Backspace" && e.key !== "Delete") return;   // nur Strg/Umschalt gedrueckt: weiter warten
      save(cams.map((c, i) => (i === capture ? { ...c, key: combo } : c.key === combo && combo ? { ...c, key: "" } : c)));
      setCapture(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capture, cams, save]);

  return (
    <section className="panel camtray" aria-label="Kamera">
      <div className="camtray-who">
        <small>KAMERA · BROADCASTING</small>
        {who ? <><b>{who.num ? `#${who.num} ` : ""}{who.name}</b><span className="muted">{who.team}</span></> : <span className="muted">Kein Auto gewählt</span>}
      </div>
      <div className="camtray-btns" role="group" aria-label="Kameras">
        {cams.map((c) => (
          <button key={c.name} type="button" className={`camb${active === c.name ? " on" : ""}`} disabled={!enabled} onClick={() => void pick(c.name)} title={c.key ? `Hotkey: ${c.key}` : "Kein Hotkey"}>
            <small>{c.key || "–"}</small>
            <b>{c.name}</b>
            {active === c.name && <i>LIVE</i>}
          </button>
        ))}
      </div>
      <button type="button" className="camtray-gear" onClick={() => setEdit((v) => !v)} aria-expanded={edit} title="Kameras und Hotkeys einstellen">⚙</button>
      {msg && !msg.ok && <span className="err camtray-msg">{msg.text}</span>}
      {edit && (
        <div className="camset">
          <h4>Kamera-Leiste einstellen</h4>
          <p className="muted">Der Name muss genau so heißen wie die Kamera im Spiel. Auf die Taste klicken, dann die Tastenkombination drücken (Esc bricht ab, Entf löscht). Gespeichert wird in diesem Browser.</p>
          {cams.map((c, i) => (
            <div key={i} className="camset-row">
              <input value={c.name} maxLength={60} aria-label="Kameraname" onChange={(e) => save(cams.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <button type="button" className={capture === i ? "primary" : undefined} onClick={() => setCapture(capture === i ? null : i)}>{capture === i ? "Taste drücken …" : c.key || "Taste wählen"}</button>
              <button type="button" aria-label="Entfernen" onClick={() => save(cams.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div className="camset-actions">
            <button type="button" onClick={() => save([...cams, { name: "Neue Kamera", key: "" }].slice(0, 24))}>+ Kamera</button>
            <button type="button" onClick={reset}>Standard wiederherstellen</button>
            <button type="button" className="primary" onClick={() => setEdit(false)}>Fertig</button>
          </div>
        </div>
      )}
    </section>
  );
}
