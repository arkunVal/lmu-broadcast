"use client";

import { useEffect, useState } from "react";
import { BC_VIEWS as VIEWS, useBcController } from "@/lib/bcSwitch";
import CopyButton from "@/components/CopyButton";
import type { EventRow } from "@/lib/labels";

const ITEMS = [
  { path: "tower", title: "Timing-Tower", size: "480 × 900", extra: "&max=10&names=tla&gap=interval", note: "Klassenweise Rangliste mit allen vier Reifen. Im Training und Quali steht die schnellste Runde oben." },
  { path: "driver", title: "Fahrerkarte", size: "420 × 200", extra: "&car=8", note: "Tempo, Rundenzeiten, Sektoren. Mit car= die Startnummer wählen, ohne folgt sie deinem Auto, follow=leader folgt dem Führenden." },
  { path: "status", title: "Status und Flaggen", size: "620 × 200", extra: "", note: "Erscheint nur bei Gelb, Full Course Yellow oder Session-Stopp (always=1 zeigt sie immer)." },
  { path: "map", title: "Streckenkarte", size: "420 × 300", extra: "", note: "Zeigt die gespeicherte Streckenkarte mit allen Autos." },
];

/** Ein Link fuer das FLM-Broadcast-Overlay: Ansichten ankreuzen, Link kopieren (eine OBS-Quelle je Szene). */
function BroadcastCard({ origin, room }: { origin: string; room: string }) {
  const [car, setCar] = useState("");
  const [vs, setVs] = useState("");
  const [fixed, setFixed] = useState(false);
  const { on, toggle } = useBcController(room);
  const extra = `${car ? `&car=${car}` : ""}${vs ? `&vs=${vs}` : ""}`;
  const base = `${origin}/overlay/broadcast?room=${encodeURIComponent(room)}`;
  const url = fixed ? `${base}&view=${on.join(",")}${extra}` : `${base}&view=live${extra}`;
  return (
    <div className="panel wide">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>FLM Broadcast</h3>
        <span className="muted">OBS-Größe 1920 × 1080</span>
      </div>
      <p className="muted" style={{ margin: "4px 0 10px" }}>
        Eine OBS-Quelle, ein Link. Mit den Knöpfen schaltest du Ansichten live an und aus, ohne OBS anzufassen. Dafür muss „Broadcast“ oder „Controls“ offen sein. Ohne Nummer folgt das Overlay dem Auto, das im Spiel angeschaut wird.
      </p>
      <div className="bcswitch" role="group" aria-label="Ansichten im Overlay">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" className={`bcsw${on.includes(k) ? " on" : ""}`} aria-pressed={on.includes(k)} onClick={() => toggle(k)}>
            <i />{label}
          </button>
        ))}
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 12, margin: "10px 0" }}>
        <input placeholder="Auto Nr. (optional)" value={car} onChange={(e) => setCar(e.target.value.replace(/\D/g, ""))} style={{ width: 150 }} />
        <input placeholder="Gegner Nr. (optional)" value={vs} onChange={(e) => setVs(e.target.value.replace(/\D/g, ""))} style={{ width: 160 }} />
        <label className="row" style={{ gap: 6, textTransform: "none", letterSpacing: 0, margin: 0, fontWeight: 500 }}>
          <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} style={{ width: "auto" }} /> Fester Link (ohne Umschalten, aktuelle Auswahl)
        </label>
      </div>
      <div className="row">
        <input readOnly value={url} style={{ flex: 1, minWidth: 260 }} onFocus={(e) => e.currentTarget.select()} />
        <CopyButton text={url} />
        <a className="btn" href={url + "&debug=1"} target="_blank" rel="noreferrer">Öffnen</a>
      </div>
    </div>
  );
}

export default function OverlaysTab({ event }: { event: EventRow }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="scrollarea">
      <div className="notice" style={{ marginBottom: 16 }}>
        In OBS: Quelle hinzufügen, „Browser“ wählen, den Link einfügen und die Größe wie angegeben setzen. Der Hintergrund ist transparent.
      </div>
      <div className="cardgrid">
      <BroadcastCard origin={origin} room={event.room} />
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
      </div>
    </div>
  );
}
