"use client";

import { useVoice } from "@/lib/voiceContext";

/** Funk für Fahrer: groß und klar, ob die Rennleitung gerade spricht. */
export default function FunkTab() {
  const v = useVoice();
  const l = v.listener;
  const state = !v.active ? "off" : l.talkingToMe ? "talk" : l.connected ? "ok" : "wait";

  return (
    <div className="scrollarea funk">
      <div className={`funkbox ${state}`} role="status" aria-live="polite">
        {state === "off" && (
          <>
            <div className="funk-t">Funk ist aus</div>
            <div className="funk-s">Du hörst die Rennleitung erst, wenn du beitrittst.</div>
            <button className="primary big" onClick={v.join}>🎧 Funk beitreten</button>
          </>
        )}
        {state === "wait" && (
          <>
            <div className="funk-t">Warte auf Rennleitung …</div>
            <div className="funk-s">Du bist im Funk. Sobald die Rennleitung ihr Mikrofon einschaltet, wirst du verbunden.</div>
          </>
        )}
        {state === "ok" && (
          <>
            <div className="funk-t">Funk verbunden</div>
            <div className="funk-s">Du hörst die Rennleitung, wenn sie spricht. Dein Mikrofon bleibt aus.</div>
          </>
        )}
        {state === "talk" && (
          <>
            <div className="funk-bars"><i /><i /><i /><i /><i /></div>
            <div className="funk-t">RENNLEITUNG SPRICHT</div>
            <div className="funk-s">Die Durchsage gilt für dich.</div>
          </>
        )}
      </div>

      {v.error && <div className="err">{v.error}</div>}

      {v.active && (
        <div className="panel">
          <h3>Einstellungen</h3>
          <label style={{ marginTop: 0 }}>Lautstärke</label>
          <div className="row" style={{ gap: 12 }}>
            <input type="range" min={0} max={1} step={0.05} value={v.volume} onChange={(e) => v.setVolume(+e.target.value)} style={{ flex: 1, maxWidth: 360 }} aria-label="Lautstärke" />
            <span className="muted">{Math.round(v.volume * 100)} %</span>
          </div>
          <div className="row" style={{ gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={v.beep}>🔔 Testton</button>
            <label className="row" style={{ margin: 0, gap: 6, fontWeight: 500 }}>
              <input type="checkbox" checked={v.chime} onChange={(e) => v.setChime(e.target.checked)} style={{ width: "auto" }} /> Signalton, wenn die Rennleitung anfängt zu sprechen
            </label>
            <button onClick={v.leave}>Funk verlassen</button>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>So funktioniert es</h3>
        <ol className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>„Funk beitreten“ klicken (der Browser braucht diesen Klick, sonst bleibt es stumm).</li>
          <li>Diesen Tab offen lassen, Lautsprecher oder Headset an.</li>
          <li>Spricht die Rennleitung, leuchtet der Kasten oben grün. Gilt es nur für dich, hörst und siehst nur du es.</li>
        </ol>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
          Im Spiel siehst du es zusätzlich über dein SimHub-Overlay (Link im Tab „Session“). Team-Gespräche laufen weiter in Discord oder TeamSpeak.
        </p>
      </div>
    </div>
  );
}
