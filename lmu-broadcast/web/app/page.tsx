"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtClock, fmtGap, fmtTime, phaseName, sessionName } from "@/lib/format";
import { useLiveData } from "@/lib/useLiveData";

const ROOM_KEY = "lmu-room";

function readInitialRoom(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("room");
    if (fromUrl) return fromUrl;
    return localStorage.getItem(ROOM_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function Home() {
  const [roomInput, setRoomInput] = useState("");
  const [room, setRoom] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const r = readInitialRoom();
    setRoomInput(r);
    setRoom(r);
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const { snapshot, connection, receivedAt, packets } = useLiveData(room);

  function applyRoom() {
    const r = roomInput.trim();
    setRoom(r);
    try {
      localStorage.setItem(ROOM_KEY, r);
    } catch {}
  }

  const ageMs = receivedAt ? now - receivedAt : null;
  const fresh = ageMs !== null && ageMs < 3000;
  const live = snapshot?.status === "live" && fresh;

  const connLabel =
    connection === "missing-config"
      ? "Konfiguration fehlt"
      : connection === "error"
        ? "Verbindungsfehler"
        : connection === "subscribed"
          ? "Mit Supabase verbunden"
          : "Verbinde …";
  const connDot = connection === "subscribed" ? "ok" : connection === "connecting" ? "warn" : "bad";

  const cars = snapshot?.cars ?? [];
  const sorted = [...cars].sort((a, b) => a.place - b.place);
  const s = snapshot?.session;
  const anyYellow = cars.some((c) => c.yellowCause);

  return (
    <div className="wrap">
      <div className="top">
        <h1>LMU Broadcast – Livetest</h1>
        <Link href="/overlays" className="chip">OBS-Overlays →</Link>
        <Link href="/events" className="chip">Rennleitung →</Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="chip"><span className={`dot ${connDot}`} />{connLabel}</span>
          <span className="chip">
            <span className={`dot ${live ? "ok" : snapshot ? "warn" : ""}`} />
            {snapshot
              ? snapshot.demo
                ? "Demo-Daten"
                : snapshot.status === "live"
                  ? fresh ? "Spiel läuft" : "Daten veraltet"
                  : "Reader läuft, Spiel nicht aktiv"
              : "Noch keine Daten"}
            {ageMs !== null && ` · ${(ageMs / 1000).toFixed(1)} s alt · ${packets} Pakete`}
          </span>
          <div className="room">
            <input
              placeholder="Raumcode"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyRoom()}
            />
            <button onClick={applyRoom}>Verbinden</button>
          </div>
        </div>
      </div>

      {connection === "missing-config" && (
        <div className="notice">
          Die Supabase-Zugangsdaten fehlen. Lege im Ordner <code>web</code> eine Datei <code>.env.local</code> an
          (Vorlage: <code>.env.example</code>) bzw. trage die beiden Variablen in Vercel unter
          „Environment Variables“ ein und starte neu.
        </div>
      )}

      {connection !== "missing-config" && !room && (
        <div className="notice">Gib oben deinen Raumcode ein (derselbe wie in der <code>config.json</code> des Readers).</div>
      )}

      {room && !snapshot && connection === "subscribed" && (
        <div className="notice">
          Verbunden, aber es kommen noch keine Daten an. Läuft der Reader (<code>start_reader.bat</code> oder{" "}
          <code>start_demo.bat</code>) mit genau diesem Raumcode?
        </div>
      )}

      {anyYellow && <div className="banner">⚠ Gelb: Ein Fahrzeug steht auf der Strecke und könnte Gelb auslösen.</div>}

      {s && (
        <div className="panel facts">
          <div className="fact"><span>Strecke</span>{s.track || "–"}</div>
          <div className="fact"><span>Session</span>{sessionName(s.type)}</div>
          <div className="fact"><span>Phase</span>{phaseName(s.phase)}</div>
          <div className="fact"><span>Restzeit</span>{fmtClock(s.remaining)}</div>
          <div className="fact"><span>Autos</span>{s.cars}</div>
          <div className="fact"><span>Strecke / Luft</span>{s.trackTemp.toFixed(0)}° / {s.airTemp.toFixed(0)}°C</div>
          <div className="fact"><span>Gelb-Sektoren</span>{s.sectorFlags.some(Boolean) ? s.sectorFlags.map((f, i) => (f ? `S${i + 1}` : null)).filter(Boolean).join(" ") : "keine"}</div>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th className="num">Pos</th>
                <th className="num">Nr</th>
                <th>Fahrer</th>
                <th>Klasse</th>
                <th className="num">km/h</th>
                <th className="num">Strecke</th>
                <th className="num">Runde</th>
                <th className="num">Aktuell</th>
                <th className="num">Letzte</th>
                <th className="num">Beste</th>
                <th className="num">S1</th>
                <th className="num">S2</th>
                <th className="num">S3</th>
                <th>Reifen</th>
                <th className="num">Abstand</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} className={c.yellowCause ? "yellow" : c.player ? "player" : ""}>
                  <td className="num">{c.place}</td>
                  <td className="num">{c.num ?? "–"}</td>
                  <td>{c.driver}</td>
                  <td><span className="tag cls">{c.cls || "–"}</span></td>
                  <td className="num">{Math.round(c.speedKmh)}</td>
                  <td className="num">{c.lapFrac != null ? `${(c.lapFrac * 100).toFixed(1)} %` : "–"}</td>
                  <td className="num">{c.laps}</td>
                  <td className="num">{fmtTime(c.lapTime)}</td>
                  <td className="num">{fmtTime(c.lastLap)}</td>
                  <td className="num">{fmtTime(c.bestLap)}</td>
                  <td className="num">{fmtTime(c.lastS1)}</td>
                  <td className="num">{fmtTime(c.lastS2)}</td>
                  <td className="num">{fmtTime(c.lastS3)}</td>
                  <td>{c.tire ? (c.tire.compound ?? c.tire.front) : "–"}</td>
                  <td className="num">{c.place === 1 ? "Leader" : fmtGap(c.gapNext)}</td>
                  <td>
                    {c.inPits && <span className="tag pit">BOX</span>}{" "}
                    {c.yellowCause && <span className="tag yel">GELB</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {snapshot && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowRaw((v) => !v)}>{showRaw ? "Rohdaten ausblenden" : "Rohdaten anzeigen"}</button>
          {showRaw && (
            <pre>{JSON.stringify({ ...snapshot, cars: snapshot.cars.slice(0, 2) }, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
