"use client";

import { useState } from "react";
import { useVoice } from "@/lib/voiceContext";
import { useLang } from "@/lib/i18n";
import { callText } from "@/lib/voice";

/** Funk für Fahrer: groß und klar, ob die Rennleitung gerade spricht. */
export default function FunkTab() {
  const v = useVoice();
  const { lang } = useLang();
  const l = v.listener;
  const [text, setText] = useState("");
  const [sentId, setSentId] = useState<string | null>(null);
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
            <div className="funk-s">{l.scope === "one" ? "Nur du wirst angesprochen." : l.scope === "group" ? "Durchsage an deine Klasse oder dein Team." : "Durchsage an alle Fahrer."}</div>
          </>
        )}
      </div>

      {v.error && <div className="err">{v.error}</div>}

      {l.invite && (
        <div className="invitebox" role="alertdialog" aria-label="Anhörung" data-testid="invite">
          <div className="funk-t" data-no-i18n>{callText(l.invite.who, v.myName, lang)}</div>
          <div className="funk-s">Thema: {l.invite.topic}</div>
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <button className="primary big" onClick={() => void v.acceptInvite()}>🎙 Annehmen</button>
            <button onClick={v.declineInvite}>Ablehnen</button>
          </div>
        </div>
      )}
      {l.interview && (
        <div className="invitebox live" data-testid="iv-live">
          <div className="funk-bars"><i /><i /><i /><i /><i /></div>
          <div className="funk-t">Anhörung läuft</div>
          <div className="funk-s">Du sprichst frei mit der Rennleitung. Mikrofon ist an. Wenn die Rennleitung beendet, ist es wieder aus.</div>
          <button onClick={v.declineInvite} style={{ marginTop: 8 }}>Verlassen</button>
        </div>
      )}

      {v.active && (
        <div className="panel">
          <h3>Nachricht an die Rennleitung</h3>
          <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); const id = v.sendToRC(text); if (id) { setSentId(id); setText(""); } }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={l.hostOnline ? "z. B. Wurde in Kurve 1 abgeschossen" : "Rennleitung ist gerade nicht im Funk"} disabled={!l.hostOnline} style={{ flex: 1, minWidth: 200 }} />
            <button disabled={!l.hostOnline || !text.trim()}>Senden</button>
          </form>
          {sentId && l.acked === sentId && <div className="okmsg" style={{ marginTop: 6 }}>✓ Angekommen bei der Rennleitung</div>}
          {!l.hostOnline && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Nachrichten gehen nur, wenn die Rennleitung oder der Broadcaster im Funk ist.</div>}
        </div>
      )}

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
