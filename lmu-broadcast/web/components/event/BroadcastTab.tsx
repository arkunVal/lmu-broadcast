"use client";

import { useMemo, useState } from "react";
import CarNo from "@/components/CarNo";
import Tires from "@/components/Tires";
import TrackMap from "@/components/TrackMap";
import { useAuth } from "@/lib/auth";
import { BC_VIEWS } from "@/lib/bcSwitch";
import { useBc } from "@/lib/bcContext";
import { sendCommand } from "@/lib/commands";
import { getSupabase } from "@/lib/supabase";
import { focusCar } from "@/lib/broadcast";
import { classColor, classLabel } from "@/lib/classes";
import { FEED_KINDS, useEventFeed, type FeedItem, type FeedKind } from "@/lib/eventFeed";
import { fmtClock, fmtGap, fmtTime } from "@/lib/format";
import type { EventDriver, EventRow, Incident } from "@/lib/labels";
import { flagInfo, useLive } from "@/lib/liveContext";
import { replayStamp } from "@/lib/replay";
import { buildGroups, sessionKind, sessionLabel } from "@/lib/standings";
import type { Car } from "@/lib/types";
import { useCamera } from "@/lib/useCamera";

const TR_COVER = 600, TR_HOLD = 900;   // ms: bis die Animation das Bild verdeckt / Spiel-Wechsel abwarten
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IR = [{ s: 7, label: "Instant Replay" }, { s: 15, label: "−15 s" }, { s: 30, label: "−30 s" }, { s: 60, label: "−60 s" }];

/** Broadcast: Rangliste, Event-Feed mit Replay, Instant Replay, Overlay-Schalter, Karte, Driver Focus, Cars Around. */
export default function BroadcastTab({ event, drivers, incidents }: { event: EventRow; drivers: EventDriver[]; incidents: Incident[] }) {
  const { profile } = useAuth();
  const canControl = profile?.role === "admin" || profile?.role === "steward" || profile?.role === "broadcaster";
  const { snapshot, live, connection } = useLive();
  const { picked, control } = useCamera(event.id);
  const bc = useBc();
  const feed = useEventFeed(snapshot, live, incidents);
  const [cls, setCls] = useState<string>("all");
  const [kinds, setKinds] = useState<FeedKind[]>(FEED_KINDS);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const s = snapshot?.session;
  const kind = s ? sessionKind(s.type) : "race";
  const all = snapshot && live ? buildGroups(snapshot.cars, kind) : [];
  const groups = cls === "all" ? all : all.filter((g) => g.cls === cls);
  const flag = flagInfo(s);
  const sel: Car | null = snapshot && live ? (snapshot.cars.find((c) => c.id === picked) ?? focusCar(snapshot, null)) : null;
  const teamOf = (c: Car) => drivers.find((d) => (c.num != null && d.car_number === c.num) || d.ingame_name.toLowerCase() === String(c.driver).toLowerCase())?.team ?? "";

  async function run(fn: () => Promise<{ ok: boolean; text: string }>) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setMsg(await fn());
    setBusy(false);
  }
  // Erst laeuft die Animation, dann (wenn sie das Bild verdeckt) bekommt das Spiel den Befehl: so gibt es keinen Versatz.
  const goReplay = (t: number, c: { num: string | null; name: string } | null) => run(async () => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, text: "Keine Verbindung" };
    bc.transition("replay");
    await sleep(TR_COVER);
    bc.setReplay(true);
    const r = await sendCommand(supabase, event.id, { kind: "jump", time: t, car: c?.num ?? null, driver: c?.name ?? null });
    if (!r.ok) bc.setReplay(false);
    return r;
  });
  const goLive = (c?: { num: string | null; name: string } | null) => run(async () => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, text: "Keine Verbindung" };
    bc.transition("live");
    await sleep(TR_COVER);
    const r = await sendCommand(supabase, event.id, { kind: "live" });
    if (r.ok && c) { const f = await sendCommand(supabase, event.id, { kind: "focus", car: c.num, driver: c.name }); await sleep(TR_HOLD); bc.setReplay(false); return f; }
    await sleep(TR_HOLD);
    bc.setReplay(false);
    return r;
  });
  const instant = (sec: number) => {
    if (!s || !sel) return;
    void goReplay(Math.max(0, Math.floor(s.time + (event.replay_offset ?? 0) - sec)), { num: sel.num, name: sel.driver });
  };
  const openFeed = (f: FeedItem) => {
    if (!canControl) return;
    if (f.num != null) bc.setFocus(f.num);
    if (f.kind === "PIT" || f.t == null) { void goLive({ num: f.num, name: f.name }); return; }   // Boxen: Live-Bild, keine Wiederholung
    const t = replayStamp(event, f.t);
    if (t != null) void goReplay(t, { num: f.num, name: f.name });
  };

  const feedShown = feed.filter((f) => kinds.includes(f.kind));
  const around = useMemo(() => {
    if (!sel) return [];
    const g = all.find((x) => x.cls === sel.cls);
    if (!g) return [];
    const i = g.rows.findIndex((r) => r.car.id === sel.id);
    return g.rows.slice(Math.max(0, i - 2), i + 3);
  }, [all, sel]);

  return (
    <div className="bcv">
      <div className="bcv-head">
        <div className={`bcv-flag ${flag.cls}`}>
          <b>{s ? sessionLabel(s.type) : "–"}</b><span>{flag.text}</span>
        </div>
        <div className="bcv-clock"><small>ELAPSED</small><b>{s ? fmtClock(s.time) : "–"}</b></div>
        <div className="bcv-clock"><small>REMAINING</small><b>{s && s.remaining > 0 ? fmtClock(s.remaining) : "–"}</b></div>
        {canControl && (
          <div className="bcv-ir" role="group" aria-label="Instant Replay">
            <small>INSTANT REPLAY</small>
            {IR.map((x) => <button key={x.s} type="button" disabled={busy || !sel} onClick={() => instant(x.s)} title={`Replay ${x.s} Sekunden zurück, auf das Auto im Bild`}>{x.label}</button>)}
            <button type="button" className="live" disabled={busy} onClick={() => void goLive(null)}>● Live</button>
          </div>
        )}
        {canControl && (
          <div className="bcv-cam" role="group" aria-label="Kamera">
            <button type="button" onClick={() => void control("prev")} title="Vorheriges Auto">◀</button>
            <button type="button" onClick={() => void control("next")} title="Nächstes Auto">▶</button>
            <button type="button" disabled={bc.focus == null} onClick={() => bc.setFocus(null)} title="Overlay folgt wieder dem Auto aus dem Spiel">Auto: Spiel</button>
          </div>
        )}
        {msg && <span className={msg.ok ? "okmsg" : "err"} style={{ margin: 0 }}>{msg.ok ? "✓ " : ""}{msg.text}</span>}
      </div>

      {!live && <div className="notice bcv-note">{connection === "subscribed" ? "Warte auf Live-Daten. Läuft der Reader mit dem Reader-Key dieses Events? Den Key findest du unter „Session“." : "Verbinde …"}</div>}

      <section className="bcv-stand panel">
        <div className="bcv-ph"><h3>Standings</h3>
          <div className="bcv-chips">
            <button type="button" className={cls === "all" ? "on" : ""} onClick={() => setCls("all")}>ALL</button>
            {all.map((g) => <button key={g.cls} type="button" className={cls === g.cls ? "on" : ""} style={{ ["--c" as string]: classColor(g.cls) }} onClick={() => setCls(g.cls)}>{classLabel(g.cls)}</button>)}
          </div>
        </div>
        <div className="bcv-scroll">
          {groups.map((g) => {
            const col = classColor(g.cls);
            const shown = (c: Car) => {
              const done = c.sector === 1 && c.lapTime != null && c.lapTime < 10;
              const sec = c.sector ?? 1;
              return [
                { v: done ? c.lastS1 : sec >= 2 ? c.curS1 : c.lastS1, fresh: done || sec >= 2 },
                { v: done ? c.lastS2 : sec === 3 ? c.curS2 : c.lastS2, fresh: done || sec === 3 },
                { v: c.lastS3, fresh: done },
              ];
            };
            const best = [0, 1, 2].map((n) => g.rows.reduce<number | null>((m, r) => { const v = shown(r.car)[n].v; return v != null && (m == null || v < m) ? v : m; }, null));
            const secCell = (c: Car, n: number) => { const { v, fresh } = shown(c)[n]; return <td className={`num sec${fresh ? (v != null && best[n] === v ? " best" : "") : " old"}`}>{fmtTime(v)}</td>; };
            return (
              <div key={g.cls} className="bcv-cls">
                <div className="bcv-clsbar" style={{ background: col }}>{classLabel(g.cls)} <span>({g.rows.length})</span></div>
                <table className="plain">
                  <thead><tr>
                    <th className="num">Pos</th><th className="ctr">#</th><th>Fahrer</th><th>Team</th><th className="num">Runden</th>
                    <th className="num">{kind === "race" ? "Abstand" : "Rückstand"}</th>{kind === "race" && <th className="num">Intervall</th>}
                    <th className="num">Letzte</th><th className="num">Beste</th><th className="ctr">Reifen</th>
                    <th className="num">S1</th><th className="num">S2</th><th className="num">S3</th><th className="ctr">Status</th>
                  </tr></thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.car.id} className={`${r.car.yellowCause ? "yellow" : ""}${canControl ? " pick" : ""}${sel?.id === r.car.id ? " picked" : ""}`} onClick={canControl ? () => { bc.setFocus(r.car.num); void control("focus", r.car); } : undefined} title={canControl ? "Kamera im Spiel auf dieses Auto stellen" : undefined}>
                        <td className="num">{r.classPos}</td>
                        <td className="ctr"><CarNo num={r.car.num} cls={r.car.cls} /></td>
                        <td>{r.car.driver}</td>
                        <td className="muted">{teamOf(r.car) || "–"}</td>
                        <td className="num">{r.car.laps}</td>
                        <td className="num gapred">{r.classPos === 1 ? "–" : r.gapLeader || fmtGap(r.car.gapLeader)}</td>
                        {kind === "race" && <td className="num gapred">{r.classPos === 1 ? "–" : r.gapInterval}</td>}
                        <td className="num">{fmtTime(r.car.lastLap)}</td>
                        <td className="num">{fmtTime(r.car.bestLap)}</td>
                        <td className="ctr"><Tires tire={r.car.tire} /></td>
                        {secCell(r.car, 0)}{secCell(r.car, 1)}{secCell(r.car, 2)}
                        <td className="ctr">
                          {r.car.finish === 3 ? <span className="pill dq">DQ</span> : r.car.inPits ? <span className="pill pit">PIT</span> : r.car.yellowCause ? <span className="pill yel">GELB</span> : <span className="pill run">RUN</span>}
                          {r.car.penalties > 0 && <span className="tag cls" style={{ marginLeft: 6 }}>{r.car.penalties} Str.</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>

      <aside className="bcv-side">
        <section className="panel bcv-feed">
          <div className="bcv-ph"><h3>Event Feed</h3></div>
          <div className="bcv-chips">
            {FEED_KINDS.map((k) => <button key={k} type="button" className={`k-${k}${kinds.includes(k) ? " on" : ""}`} onClick={() => setKinds((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))}>{k}</button>)}
          </div>
          <div className="bcv-scroll">
            {feedShown.length === 0 && <div className="muted" style={{ padding: 8 }}>Noch keine Ereignisse.</div>}
            {feedShown.map((f) => (
              <button key={f.id} type="button" className={`bcv-ev${canControl ? " pick" : ""}`} onClick={() => openFeed(f)} disabled={!canControl} title={canControl ? (f.kind === "PIT" ? "Kamera auf das Auto, Live-Bild" : "Wiederholung ab ca. 7 Sekunden davor") : undefined}>
                <i className={`k-${f.kind} on`}>{f.kind}</i>
                <span className="t">{f.t != null ? fmtClock(f.t) : "–"}</span>
                <b>{f.num != null ? `#${f.num}` : ""}</b>
                <span className="n">{f.name}</span>
                <em>{f.text}</em>
              </button>
            ))}
          </div>
        </section>

        {canControl && (
          <section className="panel bcv-ovl">
            <div className="bcv-ph"><h3>FLM Broadcast Overlay</h3><span className={`bcv-rep${bc.replay ? " on" : ""}`}>{bc.replay ? "REPLAY" : "LIVE"}</span></div>
            <div className="bcswitch" role="group" aria-label="Ansichten im Overlay">
              {BC_VIEWS.map(([k, label]) => (
                <button key={k} type="button" className={`bcsw${bc.on.includes(k) ? " on" : ""}`} aria-pressed={bc.on.includes(k)} onClick={() => bc.toggle(k)}><i />{label}</button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Link für OBS: Tab „Controls“. Bei Replay blendet das Overlay alles aus und zeigt nur das REPLAY-Banner.</p>
          </section>
        )}
      </aside>

      <div className="bcv-bottom">
        <section className="panel bcv-map"><div className="bcv-ph"><h3>Track Map</h3></div><div className="bcv-mapbox"><TrackMap snapshot={live ? snapshot : null} panel /></div></section>
        <section className="panel bcv-focus">
          <div className="bcv-ph"><h3>Driver Focus</h3>{sel && <span className="muted">#{sel.num ?? "–"}</span>}</div>
          {sel ? (
            <>
              <div className="bcv-fhead"><span className="bcv-p" style={{ ["--c" as string]: classColor(sel.cls) }}>P{sel.place}</span><div><b>{sel.driver}</b><div className="muted">{teamOf(sel) || sel.vehicle} · {classLabel(sel.cls)}</div></div><Tires tire={sel.tire} /></div>
              <div className="bcv-stats">
                <div><small>LAST LAP</small><b>{fmtTime(sel.lastLap)}</b></div>
                <div><small>BEST LAP</small><b>{fmtTime(sel.bestLap)}</b></div>
                <div><small>CLASS POS</small><b>{around.find((r) => r.car.id === sel.id)?.classPos ?? "–"} / {all.find((g) => g.cls === sel.cls)?.rows.length ?? "–"}</b></div>
                <div><small>ENERGY</small><b>{sel.energy != null ? `${Math.round(sel.energy * 100)}%` : "–"}</b></div>
                <div><small>LAPS</small><b>{sel.laps}</b></div>
                <div><small>PIT STOPS</small><b>{sel.pitStops}</b></div>
              </div>
            </>
          ) : <div className="muted">Kein Auto gewählt.</div>}
        </section>
        <section className="panel bcv-around">
          <div className="bcv-ph"><h3>Cars Around</h3></div>
          {around.map((r) => (
            <div key={r.car.id} className={`bcv-ar${r.car.id === sel?.id ? " me" : ""}`}>
              <b>{r.classPos}</b><CarNo num={r.car.num} cls={r.car.cls} /><span className="n">{r.car.driver}</span>
              <span className="g">{r.classPos === 1 ? "–" : kind === "race" ? r.gapInterval : r.gapLeader}</span>
            </div>
          ))}
          {around.length === 0 && <div className="muted">–</div>}
        </section>
      </div>
    </div>
  );
}
