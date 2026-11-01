"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVoice } from "@/lib/voiceContext";
import type { PeerMeta, Scope } from "@/lib/voice";

const STATE: Record<string, string> = { overlay: "nur Overlay", connected: "verbunden", connecting: "verbindet", new: "verbindet", disconnected: "unterbrochen", failed: "Fehler", closed: "getrennt" };

function Inbox() {
  const v = useVoice();
  return (
    <div className="inbox" data-testid="inbox">
      <div className="vsel-h">Nachrichten der Fahrer</div>
      {v.inbox.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Keine Nachrichten.</div>}
      {v.inbox.map((i) => (
        <div className="inbox-i" key={i.id}>
          <div className="inbox-h"><b>{i.from.num != null ? `#${i.from.num} ` : ""}{i.from.name}</b><span className="muted"> · {i.from.team ?? "–"} · {new Date(i.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span></div>
          <div>{i.text}</div>
          <button onClick={() => v.dismissInbox(i.id)} style={{ marginTop: 4 }}>Erledigt</button>
        </div>
      ))}
    </div>
  );
}

function Interview({ match, label, target }: { match: (m: PeerMeta) => boolean; label: string; target: string }) {
  const v = useVoice();
  const [topic, setTopic] = useState("");
  const iv = v.interview;
  const ST = { invited: "gerufen …", live: "im Gespräch", declined: "abgelehnt" } as const;
  return (
    <div className="ivbox" data-testid="ivbox">
      <div className="vsel-h">3. Interview (Fahrer in ein Gespräch bitten)</div>
      {!iv ? (
        <form className="row" style={{ gap: 8, margin: "6px 0" }} onSubmit={(e) => { e.preventDefault(); if (!target) return; v.invite(match, topic.trim() || "Gespräch mit der Rennleitung"); setTopic(""); }}>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={160} placeholder="Thema, z. B. Vorfall Runde 7 erklären" style={{ flex: 1, minWidth: 200 }} disabled={!target} />
          <button className="primary" disabled={!target}>{target ? `${label} ins Interview bitten` : "Erst Empfänger wählen"}</button>
        </form>
      ) : (
        <div className="ivlive">
          <div><b>Interview:</b> {iv.topic}</div>
          {iv.people.map((p) => <div key={p.meta.uid}><i className={`dot ${p.status === "live" ? "ok" : "warn"}`} />{p.meta.num != null ? `#${p.meta.num} ` : ""}{p.meta.name} · {ST[p.status]}</div>)}
          <button onClick={v.endInterview} style={{ marginTop: 6 }}>Interview beenden</button>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Wer annimmt, spricht frei mit dir. Nur diese Fahrer sehen die Einblendung im Overlay.</div>
        </div>
      )}
    </div>
  );
}

/** Sprechfunk der Rennleitung: an alle, eine Klasse, ein Team oder einen Fahrer. */
export default function VoicePanel() {
  const v = useVoice();
  const [target, setTarget] = useState("");
  const [latch, setLatch] = useState(false);
  const [down, setDown] = useState(false);
  const held = useRef(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");

  const classes = useMemo(() => [...new Set(v.peers.map((p) => p.meta.cls).filter(Boolean) as string[])].sort(), [v.peers]);
  const teams = useMemo(() => [...new Set(v.peers.map((p) => p.meta.team).filter(Boolean) as string[])].sort(), [v.peers]);
  const match = useMemo(() => (m: PeerMeta) => {
    if (!target) return false;
    if (target === "all") return true;
    const [k, ...rest] = target.split(":");
    const val = rest.join(":");
    return k === "cls" ? m.cls === val : k === "team" ? m.team === val : m.uid === val;
  }, [target]);

  const scope: Scope = target === "all" ? "all" : target.startsWith("drv:") ? "one" : "group";
  function start() {
    if (!v.micOn || !target) return;
    held.current = true;
    setDown(true);
    v.talk(match, scope);
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
  if (!v.staff) return (
    <div className="panel voice">
      <h3>Fahrer-Nachrichten</h3>
      {!v.active ? <button className="primary" onClick={v.join}>Mitlesen starten</button> : <><Inbox /><button onClick={v.leave} style={{ marginTop: 8 }}>Beenden</button></>}
      {v.error && <div className="err">{v.error}</div>}
    </div>
  );

  const count = v.peers.filter((p) => match(p.meta)).length;
  const label = !target ? "" : target === "all" ? "Alle Fahrer" : target.startsWith("cls:") ? `Klasse ${target.slice(4)}` : target.startsWith("team:") ? `Team ${target.slice(5)}` : (v.peers.find((p) => `drv:${p.meta.uid}` === target)?.meta.name ?? "Fahrer");

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
          <div className="vsel">
            <div className="vsel-h">1. Wen willst du ansprechen?</div>
            <div className="vgroup"><span className="muted">Alle</span>
              <button type="button" className={target === "all" ? "primary" : ""} onClick={() => setTarget("all")}>Alle Fahrer</button>
            </div>
            {classes.length > 0 && <div className="vgroup"><span className="muted">Klasse</span>
              {classes.map((c) => <button type="button" key={c} className={target === `cls:${c}` ? "primary" : ""} onClick={() => setTarget(`cls:${c}`)}>{c}</button>)}
            </div>}
            {teams.length > 0 && <div className="vgroup"><span className="muted">Team</span>
              {teams.map((t) => <button type="button" key={t} className={target === `team:${t}` ? "primary" : ""} onClick={() => setTarget(`team:${t}`)}>{t}</button>)}
            </div>}
            <div className="vgroup"><span className="muted">Fahrer</span>
              {v.peers.length === 0 && <span className="muted">Noch niemand im Funk.</span>}
              {v.peers.map((p) => <button type="button" key={p.meta.uid} className={target === `drv:${p.meta.uid}` ? "primary" : ""} onClick={() => setTarget(`drv:${p.meta.uid}`)}>{p.meta.num != null ? `#${p.meta.num} ` : ""}{p.meta.name}</button>)}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>{target ? `Gewählt: ${label} · ${count} erreichbar` : "Noch niemand gewählt."}</div>
          </div>
          <div className="vsel-h" style={{ marginTop: 10 }}>2. Sprechen oder Nachricht</div>
          <form className="row" style={{ gap: 8, margin: "6px 0" }} onSubmit={(e) => { e.preventDefault(); if (!target || !text.trim()) return; const n = v.message(text.trim(), match); setSent(n ? `Nachricht an ${n} Fahrer gesendet (Overlay)` : "Niemand erreichbar"); setText(""); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={target ? `Kurznachricht an ${label} (erscheint im Fahrer-Overlay)` : "Erst Empfänger wählen"} disabled={!target} style={{ flex: 1, minWidth: 200 }} />
            <button disabled={!target || !text.trim()}>Senden</button>
            {sent && <span className="muted">{sent}</span>}
          </form>
          <div className="row" style={{ gap: 10, margin: "10px 0", flexWrap: "wrap" }}>
            <button
              className={`ptt${down || (latch && v.talking) ? " on" : ""}`}
              onPointerDown={(e) => { e.preventDefault(); if (latch && v.talking) { v.talk(null); setLatch(false); } else start(); }}
              onPointerUp={stop}
              onPointerLeave={stop}
              disabled={!target || count === 0}
              title={target ? "Gedrückt halten zum Sprechen (Taste V)" : "Erst einen Empfänger wählen"}
            >
              {down || (latch && v.talking) ? `● Du sprichst zu ${label}` : target ? `Sprechen an ${label} (halten) · V` : "Erst Empfänger wählen"}
            </button>
            <label className="row" style={{ margin: 0, gap: 6, fontWeight: 500 }}>
              <input type="checkbox" checked={latch} onChange={(e) => setLatch(e.target.checked)} style={{ width: "auto" }} /> Dauersprechen (Knopf bleibt an)
            </label>
            <button onClick={v.leave}>Funk beenden</button>
          </div>
          <Interview match={match} label={label} target={target} />
          <Inbox />
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
