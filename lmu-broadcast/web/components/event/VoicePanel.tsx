"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVoice } from "@/lib/voiceContext";
import type { PeerMeta } from "@/lib/voice";

const STATE: Record<string, string> = { connected: "verbunden", connecting: "verbindet", new: "verbindet", disconnected: "unterbrochen", failed: "Fehler", closed: "getrennt" };

/** Sprechfunk der Rennleitung: an alle, eine Klasse, ein Team oder einen Fahrer. */
export default function VoicePanel() {
  const v = useVoice();
  const [target, setTarget] = useState("");
  const [latch, setLatch] = useState(false);
  const [down, setDown] = useState(false);
  const held = useRef(false);

  const classes = useMemo(() => [...new Set(v.peers.map((p) => p.meta.cls).filter(Boolean) as string[])].sort(), [v.peers]);
  const teams = useMemo(() => [...new Set(v.peers.map((p) => p.meta.team).filter(Boolean) as string[])].sort(), [v.peers]);
  const match = useMemo(() => (m: PeerMeta) => {
    if (!target) return false;
    if (target === "all") return true;
    const [k, ...rest] = target.split(":");
    const val = rest.join(":");
    return k === "cls" ? m.cls === val : k === "team" ? m.team === val : m.uid === val;
  }, [target]);

  function start() {
    if (!v.micOn || !target) return;
    held.current = true;
    setDown(true);
    v.talk(match);
  }
  function stop() {
    if (!held.current) return;
    held.current = false;
    setDown(false);
    if (!latch) v.talk(null);
  }

  useEffect(() => {
    const typing = (e: KeyboardEvent) => ["INPUT", "SELECT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName);
    const kd = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "v" && !e.repeat && !typing(e) && v.active) start(); };
    const ku = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "v" && !typing(e)) stop(); };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  });

  // Dauersprechen: Taste einmal drücken schaltet um
  useEffect(() => { if (!latch && !down) v.talk(null); }, [latch]); // eslint-disable-line react-hooks/exhaustive-deps

  if (v.mode !== "host") return <div className="panel"><h3>Sprechfunk</h3><div className="muted">Nur Rennleitung (Admin, Steward) kann sprechen.</div></div>;

  const count = v.peers.filter((p) => match(p.meta)).length;

  return (
    <div className="panel voice">
      <h3>Sprechfunk</h3>
      <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
        Kostenlos im Browser. Fahrer treten oben mit „Funk beitreten“ bei. Team-Gespräche bleiben in Discord oder TeamSpeak.
      </p>
      {!v.active ? (
        <button className="primary" onClick={v.join}>Mikrofon an und Funk starten</button>
      ) : (
        <>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <label style={{ margin: 0 }}>Sprechen an</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: "auto" }} aria-label="Empfänger">
              <option value="">— Empfänger wählen —</option>
              <option value="all">Alle Fahrer</option>
              {classes.length > 0 && <optgroup label="Klasse">{classes.map((c) => <option key={c} value={`cls:${c}`}>{c}</option>)}</optgroup>}
              {teams.length > 0 && <optgroup label="Team">{teams.map((t) => <option key={t} value={`team:${t}`}>{t}</option>)}</optgroup>}
              <optgroup label="Fahrer">{v.peers.map((p) => <option key={p.meta.uid} value={`drv:${p.meta.uid}`}>{p.meta.num != null ? `#${p.meta.num} ` : ""}{p.meta.name}</option>)}</optgroup>
            </select>
            <span className="muted">{target ? `${count} erreichbar` : "Erst Empfänger wählen, dann sprechen."}</span>
          </div>
          <div className="row" style={{ gap: 10, margin: "10px 0", flexWrap: "wrap" }}>
            <button
              className={`ptt${down || (latch && v.talking) ? " on" : ""}`}
              onPointerDown={(e) => { e.preventDefault(); if (latch && v.talking) { v.talk(null); setLatch(false); } else start(); }}
              onPointerUp={stop}
              onPointerLeave={stop}
              disabled={!target || count === 0}
              title={target ? "Gedrückt halten zum Sprechen (Taste V)" : "Erst einen Empfänger wählen"}
            >
              {down || (latch && v.talking) ? "● Du sprichst" : "Sprechen (halten) · V"}
            </button>
            <label className="row" style={{ margin: 0, gap: 6, fontWeight: 500 }}>
              <input type="checkbox" checked={latch} onChange={(e) => setLatch(e.target.checked)} style={{ width: "auto" }} /> Dauersprechen (Knopf bleibt an)
            </label>
            <button onClick={v.leave}>Funk beenden</button>
          </div>
          <table className="plain">
            <thead><tr><th>Fahrer</th><th>Team</th><th>Klasse</th><th>Verbindung</th></tr></thead>
            <tbody>
              {v.peers.length === 0 && <tr><td colSpan={4} className="muted">Noch niemand im Funk.</td></tr>}
              {v.peers.map((p) => (
                <tr key={p.meta.uid}>
                  <td>{p.meta.num != null ? `#${p.meta.num} ` : ""}{p.meta.name}</td>
                  <td className="muted">{p.meta.team ?? "–"}</td>
                  <td className="muted">{p.meta.cls ?? "–"}</td>
                  <td><i className={`dot ${p.state === "connected" ? "ok" : "warn"}`} />{STATE[p.state] ?? p.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {v.error && <div className="err">{v.error}</div>}
    </div>
  );
}
