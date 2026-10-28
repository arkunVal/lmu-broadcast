"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import type { EventRow } from "@/lib/labels";

const ITEMS = [
  { path: "tower", title: "Timing-Tower", size: "480 × 900", extra: "&max=10&names=tla&gap=interval", note: "Klassenweise Rangliste mit allen vier Reifen. Im Training und Quali steht die schnellste Runde oben." },
  { path: "driver", title: "Fahrerkarte", size: "420 × 200", extra: "&car=8", note: "Tempo, Rundenzeiten, Sektoren. Mit car= die Startnummer wählen, ohne folgt sie deinem Auto, follow=leader folgt dem Führenden." },
  { path: "status", title: "Status und Flaggen", size: "620 × 200", extra: "", note: "Erscheint nur bei Gelb, Full Course Yellow oder Session-Stopp (always=1 zeigt sie immer)." },
  { path: "map", title: "Streckenkarte", size: "420 × 300", extra: "", note: "Zeigt die gespeicherte Streckenkarte mit allen Autos." },
];

export default function OverlaysTab({ event }: { event: EventRow }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <>
      <div className="notice">
        In OBS: Quelle hinzufügen, „Browser“ wählen, den Link einfügen und die Größe wie angegeben setzen. Der Hintergrund ist transparent.
      </div>
      {ITEMS.map((it) => {
        const url = `${origin}/overlay/${it.path}?room=${encodeURIComponent(event.room)}${it.extra}`;
        return (
          <div className="panel" key={it.path}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>{it.title}</h3>
              <span className="muted">OBS-Größe {it.size}</span>
            </div>
            <p className="muted" style={{ margin: "4px 0 10px" }}>{it.note}</p>
            <div className="row">
              <input readOnly value={url} style={{ flex: 1, minWidth: 260 }} onFocus={(e) => e.currentTarget.select()} />
              <CopyButton text={url} />
              <a className="btn" href={url + "&debug=1"} target="_blank" rel="noreferrer">Öffnen</a>
            </div>
          </div>
        );
      })}
    </>
  );
}
