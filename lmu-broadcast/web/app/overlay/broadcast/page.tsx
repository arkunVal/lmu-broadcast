"use client";

import "./broadcast.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { classColor, classLabel } from "@/lib/classes";
import {
  brandOf, classPos, focusCar, fmtLap, fmtRun, gapText, initialName, ordinal, overallBestSectors, pairGap, pickPair, sectorDeltas,
  sectorStates, tla, classOrder, type SectorState,
} from "@/lib/broadcast";
import { fmtClock } from "@/lib/format";
import { sessionKind, sessionLabel } from "@/lib/standings";
import type { Car, Snapshot } from "@/lib/types";
import { num, useOverlayData } from "@/lib/useOverlayData";
import { useLiveViews } from "@/lib/bcSwitch";

/**
 * FLM Broadcast: Timing-Tower, Fahrerkarte, Head to Head, Onboard Battle, Onboard Telemetry, Virtual Energy, Replay.
 * URL: ?room=CODE&view=live (Ansichten per Knopf in Controls umschaltbar) oder view=tower,driver  (view: tower driver h2h battle telemetry energy replay)
 *   car=NUM  Auto fest waehlen (sonst: das im Spiel angeschaute Auto)
 *   vs=NUM   Gegner fuer h2h/battle fest waehlen (sonst automatisch der Nachbar mit dem kleineren Abstand)
 *   cars=7,94,35  Autos fuer die Sektor-Karten (telemetry); sonst Fokus-Auto plus Nachbarn
 *   max=18 scale=1 debug=1
 */
export default function Broadcast() {
  const { params, snapshot, receivedAt, connection, debug } = useOverlayData();
  const timers = useLapTimers(snapshot, receivedAt);
  const viewParam = params?.get("view") ?? "tower,driver";
  const liveMode = viewParam === "live";
  const ctl = useLiveViews(params?.get("room") ?? "", liveMode, ["tower"]);
  if (!snapshot) return debug ? <div className="bc" style={{ padding: 20 }}>Broadcast: keine Live-Daten ({connection})</div> : null;

  const views = new Set(liveMode ? ctl.views : viewParam.split(",").map((v) => v.trim()));
  // Replay: das Spiel meldet es (Reader); sonst gilt der Schalter der Website. Dann alles ausblenden, nur das Banner zeigen.
  const replayOn = views.has("replay") || (snapshot.session.replay != null ? snapshot.session.replay : ctl.replay);
  const scale = num(params, "scale", 1);
  const carNo = params?.get("car")?.trim() || (liveMode ? ctl.focus : null) || null;   // Text: 007, 07 und 7 sind verschiedene Autos
  const vsNo = params?.get("vs")?.trim() || null;
  const max = num(params, "max", 18);
  const focus = focusCar(snapshot, carNo);
  const pair = focus && (views.has("h2h") || views.has("battle")) ? pickPair(snapshot.cars, focus, vsNo) : null;
  const battle = views.has("h2h") || views.has("battle");
  const mode: "energy" | "battle" | "normal" = views.has("energy") ? "energy" : battle && pair ? "battle" : "normal";
  const listed = (params?.get("cars") ?? "").split(",").map((x) => x.trim()).filter(Boolean);

  const show = (v: boolean) => v && !replayOn;
  return (
    <div className="bc" style={{ fontSize: 16 * scale }}>
      <ReplayBanner on={replayOn} />
      {liveMode && <Transition tr={ctl.tr} />}
      {liveMode && <Notes notes={ctl.notes} />}
      <Present show={show(views.has("tower"))} anim="left"><Tower snap={snapshot} mode={mode} pair={pair} max={max} /></Present>
      <Present show={show((views.has("telemetry") || views.has("battle")) && !!focus)} anim="drop">{focus && <TelemetryTop car={focus} />}</Present>
      <Present show={show(views.has("driver") && !battle && !views.has("telemetry") && !!focus)} anim="wipe">{focus && <DriverCard car={focus} red={mode === "energy"} />}</Present>
      <Present show={show(battle && !!pair)} anim="rise">{pair && <HeadToHead pair={pair} laps={views.has("battle")} />}</Present>
      <Present show={show(views.has("telemetry") && !battle && !!focus)} anim="rise">{focus && <SectorCards cars={cardCars(snapshot, focus, listed)} snap={snapshot} timers={timers} />}</Present>
    </div>
  );
}

/** Ein-/Ausblenden mit Animation: bleibt beim Ausblenden kurz eingehaengt, damit die Ausblende-Animation laufen kann. */
function Present({ show, anim, children }: { show: boolean; anim: "left" | "drop" | "wipe" | "rise" | "fade"; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(show);
  const last = useRef<React.ReactNode>(children);
  if (show) last.current = children;   // beim Ausblenden den letzten Inhalt weiter zeigen
  useEffect(() => {
    if (show) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), 650);
    return () => clearTimeout(t);
  }, [show]);
  if (!mounted && !show) return null;
  return <div className={`bc-pres bc-a-${anim} ${show ? "in" : "out"}`}>{last.current}</div>;
}

/** Grosses REPLAY-Banner (rote Linien, Schrift schlaegt ein), danach kleine Marke oben links. */
function ReplayBanner({ on }: { on: boolean }) {
  const [phase, setPhase] = useState<"off" | "intro" | "badge">("off");
  useEffect(() => {
    if (!on) { setPhase((p) => (p === "off" ? p : "off")); return; }
    setPhase("intro");
    const t = setTimeout(() => setPhase("badge"), 2600);
    return () => clearTimeout(t);
  }, [on]);
  return (
    <Present show={on} anim="fade">
      <div className={`bc-rp ${phase}`}>
        <div className="bc-rp-line l" /><div className="bc-rp-word">REPLAY</div><div className="bc-rp-line r" />
        <div className="bc-rp-sub">INSTANT REPLAY</div>
        <div className="bc-rp-badge">REPLAY</div>
      </div>
    </Present>
  );
}

/* ---------------- Rundentimer: startet mit Start/Ziel, laeuft glatt (nicht abgehackt wie der Reader-Wert) ---------------- */
function useLapTimers(snap: Snapshot | null, receivedAt: number | null) {
  const map = useRef(new Map<number, { laps: number; anchor: number }>());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, []);
  useMemo(() => {
    if (!snap || !receivedAt) return;
    for (const c of snap.cars) {
      const est = receivedAt - (c.lapTime ?? 0) * 1000;
      const st = map.current.get(c.id);
      if (!st || st.laps !== c.laps || Math.abs(st.anchor - est) > 1500) map.current.set(c.id, { laps: c.laps, anchor: est });
    }
  }, [snap, receivedAt]);
  return (c: Car): number | null => {
    const st = map.current.get(c.id);
    if (!st || c.lapTime == null) return c.lapTime ?? null;
    return Math.max(0, (now - st.anchor) / 1000);
  };
}

function cardCars(snap: Snapshot, focus: Car, listed: string[]): Car[] {
  if (listed.length) return listed.map((n) => snap.cars.find((c) => c.num === n)).filter((c): c is Car => !!c).slice(0, 3);
  const list = [...snap.cars].sort((a, b) => a.place - b.place);
  const i = list.findIndex((c) => c.id === focus.id);
  return [list[i], list[i + 1], list[i - 1]].filter(Boolean).slice(0, 3);
}

/* ---------------- Bausteine ---------------- */
const Brand = ({ car }: { car: Car }) => <span className="bc-brand" style={{ ["--c" as string]: classColor(car.cls) }}>{brandOf(car.vehicle) || "·"}</span>;

function Logo() {
  return (
    <div className="bc-logo">
      <svg viewBox="0 0 24 24" width="1.6em" height="1.6em" aria-hidden><path d="M5 3l15 9-15 9z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" /></svg>
      <b><span style={{ color: "#FFE600" }}>FLM</span> BROADCAST</b>
    </div>
  );
}

function Tower({ snap, mode, pair, max }: { snap: Snapshot; mode: "energy" | "battle" | "normal"; pair: [Car, Car] | null; max: number }) {
  const kind = sessionKind(snap.session.type);
  const race = kind === "race";
  const overall = useMemo(() => overallBestSectors(snap.cars), [snap.cars]);
  const classes = useMemo(() => {
    const by = new Map<string, Car[]>();
    for (const c of snap.cars) by.set(c.cls || "–", [...(by.get(c.cls || "–") ?? []), c]);
    return [...by.values()].sort((a, b) => classOrder(a[0], b[0])).map((l) => l.sort((a, b) => classPos(a) - classPos(b)));
  }, [snap.cars]);
  const title = mode === "energy" ? "VIRTUAL ENERGY" : mode === "battle" && pair ? `BATTLE FOR ${ordinal(classPos(pair[0]))}` : race ? "RACE" : sessionLabel(snap.session.type);
  const clock = race ? snap.session.remaining : snap.session.remaining;
  let rows = 0;
  return (
    <div className="bc-tower">
      <div className="bc-head"><Logo /><div className="bc-clock bc-num">{clock > 0 ? (clock >= 3600 ? fmtClock(clock) : fmtClock(clock).slice(2)) : "--"}</div></div>
      {classes.map((list, gi) => (
        <div key={list[0].cls}>
          <div className={`bc-band${gi === 0 ? " red" : ""}`} style={gi ? ({ ["--c" as string]: classColor(list[0].cls) } as React.CSSProperties) : undefined}>
            {gi === 0 ? title : classLabel(list[0].cls)}
          </div>
          {list.map((c, i) => {
            if (rows >= max) return null;
            rows++;
            const hl = pair ? (c.id === pair[0].id ? "hl-a" : c.id === pair[1].id ? "hl-b" : "") : "";
            let right: React.ReactNode;
            if (mode === "energy") right = <Energy v={c.energy} />;
            else if (race) right = i === 0 ? "LEADER" : gapText(c.cGapLeader, c.cLapsLeader);
            else right = i === 0 ? "INTERVAL" : gapText(c.cGapAhead, c.cLapsAhead);
            const st = !race && mode !== "energy" ? sectorStates(c, overall) : null;
            return (
              <div className={`bc-row ${hl}`} key={c.id} style={{ ["--i" as string]: i }}>
                <span className="bc-pos bc-num">{classPos(c)}</span>
                <Brand car={c} />
                <span className="bc-no bc-num">{c.num ?? "–"}</span>
                <span className="bc-tla">{tla(c.driver)}</span>
                <span className="bc-gap bc-num">{c.inPits ? "PIT" : c.finish === 2 ? "RETIRED" : right}</span>
                {st && <Sectors st={st} mini />}
              </div>
            );
          })}
        </div>
      ))}
      <div className="bc-foot">{snap.session.track}</div>
    </div>
  );
}

function Energy({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="bc-dim">–</span>;
  const pct = Math.round(v * 100);
  return (
    <span className="bc-energy">
      <i style={{ ["--w" as string]: `${pct}%` }} data-low={pct < 30 ? 1 : 0} />
      <b>{pct}%</b>
    </span>
  );
}

function Sectors({ st, mini }: { st: SectorState[]; mini?: boolean }) {
  return <span className={`bc-sec${mini ? " mini" : ""}`}>{st.map((s, i) => <i key={i} data-s={s} />)}</span>;
}

function DriverCard({ car, red }: { car: Car; red?: boolean }) {
  return (
    <div className={`bc-driver${red ? " red" : ""}`} style={{ ["--c" as string]: red ? "#e4122b" : classColor(car.cls) }}>
      <span className="bc-dpos">{ordinal(classPos(car)).toLowerCase().replace(/(\d+)(.*)/, "$1")}<sup>{ordinal(classPos(car)).slice(-2).toLowerCase()}</sup></span>
      <div><b>{initialName(car.driver)}</b><small>{car.vehicle}</small></div>
      <span className="bc-dno bc-num">#{car.num ?? "–"}</span>
    </div>
  );
}

function TelemetryTop({ car }: { car: Car }) {
  const pct = car.energy != null ? Math.round(car.energy * 100) : null;
  return (
    <div className="bc-telem">
      <span className="bc-tno" style={{ ["--c" as string]: classColor(car.cls) }}><Brand car={car} /> <b className="bc-num">{car.num ?? "–"}</b></span>
      <div className="bc-tbar">
        <div className="bc-seg">{Array.from({ length: 12 }, (_, i) => <i key={i} className={pct != null && i < Math.round((pct / 100) * 12) ? "on" : ""} data-low={pct != null && pct < 30 ? 1 : 0} />)}<b>{pct != null ? `${pct}%` : "–"}</b></div>
        <small>VIRTUAL ENERGY TANK</small>
      </div>
      <div className="bc-speed"><b className="bc-num">{Math.round(car.speedKmh)}</b><small>KMH</small><small className="mph">{Math.round(car.speedKmh * 0.621371)} MPH</small></div>
    </div>
  );
}

function side(c: Car, right: boolean) {
  return (
    <div className={`bc-side${right ? " r" : ""}`} style={{ ["--c" as string]: classColor(c.cls) }}>
      <div className="bc-sname"><span className="bc-sp">{classPos(c)}<sup>{ordinal(classPos(c)).slice(-2).toLowerCase()}</sup></span> <b>{brandOf(c.vehicle) ? c.vehicle.split(" #")[0].toUpperCase() : c.vehicle.toUpperCase()}</b></div>
      <div className="bc-sdrv"><span className="bc-sno bc-num">{c.num ?? "–"}</span><b>{initialName(c.driver)}</b></div>
    </div>
  );
}

function HeadToHead({ pair, laps }: { pair: [Car, Car]; laps: boolean }) {
  const [a, b] = pair;
  const gap = pairGap(a, b);
  const deltas = sectorDeltas(a, b);
  const faster = (x: number | null | undefined, y: number | null | undefined) => (x != null && y != null ? (x < y ? "g" : x > y ? "" : "") : "");
  return (
    <div className="bc-h2h">
      {side(a, false)}
      <div className="bc-mid">
        <div className="bc-mid-h">CURRENT GAP</div>
        <div className="bc-mid-b">
          <div className="bc-big bc-num">{gap != null ? `+${gap.toFixed(3)}s` : "–"}</div>
          {laps ? (
            <div className="bc-laps bc-num">
              <span className={faster(a.lastLap, b.lastLap)}>{fmtLap(a.lastLap)}</span><em>LAST</em><span className={faster(b.lastLap, a.lastLap)}>{fmtLap(b.lastLap)}</span>
              <span className={faster(a.prevLap, b.prevLap)}>{fmtLap(a.prevLap)}</span><em>-1</em><span className={faster(b.prevLap, a.prevLap)}>{fmtLap(b.prevLap)}</span>
            </div>
          ) : (
            <div className="bc-ds">
              {deltas.map((d, i) => (
                <span key={i} data-neg={d != null && d < 0 ? 1 : 0}><b className="bc-num">{d == null ? "" : `${d >= 0 ? "+" : "-"}${Math.abs(d).toFixed(3)}`}</b><i />S{i + 1}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {side(b, true)}
    </div>
  );
}

function SectorCards({ cars, snap, timers }: { cars: Car[]; snap: Snapshot; timers: (c: Car) => number | null }) {
  const overall = overallBestSectors(snap.cars);
  return (
    <div className="bc-cards">
      {cars.map((c) => (
        <div className="bc-card" key={c.id} style={{ ["--c" as string]: classColor(c.cls) }}>
          <div className="bc-card-h"><span><Brand car={c} /> <b className="bc-num">{c.num ?? "–"}</b></span><em>{initialName(c.driver)}</em></div>
          <div className="bc-card-b"><b className="bc-num">{ordinal(classPos(c)).toLowerCase()}</b><span className="bc-num">{c.inPits ? "PIT" : fmtRun(timers(c) ?? 0)}</span></div>
          <Sectors st={sectorStates(c, overall)} />
        </div>
      ))}
    </div>
  );
}

/** Wischer-Animation beim Wechsel Replay/Live. Das Spiel wird erst geschaltet, wenn sie das Bild verdeckt. */
function Transition({ tr }: { tr: { k: "replay" | "live"; id: number } | null }) {
  const [cur, setCur] = useState<typeof tr>(null);
  const last = useRef(0);
  useEffect(() => {
    if (!tr || tr.id === last.current) return;
    last.current = tr.id;
    setCur(tr);
    const t = setTimeout(() => setCur(null), 1600);
    return () => clearTimeout(t);
  }, [tr]);
  if (!cur) return null;
  return <div key={cur.id} className={`bc-tr ${cur.k}`}><div className="bc-tr-band"><div className="bc-tr-word">{cur.k === "live" ? "LIVE" : "REPLAY"}</div></div></div>;
}

/** Meldungen der Rennleitung, wie sie auch die Fahrer sehen. */
function Notes({ notes }: { notes: import("@/lib/bcSwitch").BcNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="bc-notes" data-testid="bc-notes">
      {notes.map((n) => (
        <div key={n.id} className={`bc-note ${n.t}`}>
          <div className="bc-note-top"><span>{n.tag}</span>{n.lap != null && <span>Lap {n.lap}</span>}</div>
          {n.who && <div className="bc-note-who">{n.who}</div>}
          <div className="bc-note-main">{n.main}</div>
          {n.sub && <div className="bc-note-sub">{n.sub}</div>}
        </div>
      ))}
    </div>
  );
}
