"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const ITEMS = [
  { path: "tower", title: "Timing-Tower", size: "360 × 900", extra: "&max=10&names=tla&gap=interval", note: "Klassenweise Rangliste. Im Training/Quali mit schnellster Runde oben." },
  { path: "driver", title: "Fahrerkarte", size: "460 × 260", extra: "&car=8", note: "Tempo, Rundenzeiten, Sektoren. Ohne car= folgt sie deinem eigenen Auto; follow=leader folgt dem Führenden." },
  { path: "status", title: "Status / Flaggen", size: "620 × 200", extra: "", note: "Erscheint nur bei Gelb / Full Course Yellow / Session-Stopp (always=1 zeigt sie immer)." },
  { path: "map", title: "Streckenkarte", size: "420 × 300", extra: "", note: "Lernt den Streckenverlauf nach einer Runde aus den Autopositionen." },
];

export default function Overlays() {
  const [room, setRoom] = useState("");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      setRoom(localStorage.getItem("lmu-room") ?? "");
    } catch {}
  }, []);

  function copy(url: string) {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  return (
    <div className="wrap">
      <div className="top">
        <h1>OBS-Overlays</h1>
        <Link href="/" className="chip">← Livetest</Link>
      </div>
      <div className="panel">
        <div className="room">
          <input
            placeholder="Raumcode"
            value={room}
            onChange={(e) => {
              setRoom(e.target.value);
              try { localStorage.setItem("lmu-room", e.target.value); } catch {}
            }}
          />
          <span style={{ color: "var(--muted)" }}>
            In OBS: Quelle hinzufügen → <b>Browser</b> → URL einfügen → Breite/Höhe wie angegeben. Hintergrund ist transparent.
          </span>
        </div>
      </div>
      {ITEMS.map((it) => {
        const url = `${origin}/overlay/${it.path}?room=${encodeURIComponent(room || "DEIN-CODE")}${it.extra}`;
        return (
          <div className="panel" key={it.path}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <b>{it.title}</b>
              <span style={{ color: "var(--muted)" }}>OBS-Größe: {it.size}</span>
            </div>
            <div style={{ color: "var(--muted)", margin: "4px 0 8px" }}>{it.note}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input readOnly value={url} style={{ flex: 1, minWidth: 260 }} onFocus={(e) => e.currentTarget.select()} />
              <button onClick={() => copy(url)}>{copied === url ? "Kopiert ✓" : "Kopieren"}</button>
              <a href={url + "&debug=1"} target="_blank" rel="noreferrer"><button>Öffnen</button></a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
