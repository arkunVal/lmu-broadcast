"use client";

import { useVoice } from "@/lib/voiceContext";

/** Für Fahrer: Funk der Rennleitung hören. Ein Klick ist nötig, sonst blockiert der Browser den Ton. */
export default function ListenerButton() {
  const v = useVoice();
  if (v.mode !== "listener") return null;
  return (
    <div className="row" style={{ gap: 8 }}>
      {!v.active ? (
        <button className="primary" onClick={v.join} title="Du hörst Durchsagen der Rennleitung. Dein Mikrofon bleibt aus.">🎧 Funk beitreten</button>
      ) : (
        <>
          <span className={`pill ${v.listener.talkingToMe ? "yel" : "run"}`}>
            {v.listener.talkingToMe ? "Rennleitung spricht" : v.listener.connected ? "Funk verbunden" : "Warte auf Rennleitung"}
          </span>
          <button onClick={v.leave}>Verlassen</button>
        </>
      )}
      {v.error && <span className="err" style={{ margin: 0 }}>{v.error}</span>}
    </div>
  );
}
