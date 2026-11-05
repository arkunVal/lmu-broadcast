"use client";

import { classColor, classLabel } from "@/lib/classes";
import Tires from "@/components/Tires";
import { fmtClock, fmtTime } from "@/lib/format";
import { buildGroups, overallFastest, sessionKind, sessionLabel, shortName } from "@/lib/standings";
import { num, useOverlayData } from "@/lib/useOverlayData";

/**
 * Timing-Tower fuer OBS.
 * Optionen in der URL:
 *   room=CODE   (Pflicht)
 *   max=15      maximale Zeilen pro Klasse
 *   cls=hyper   nur eine Klasse zeigen (Textteil des Klassennamens)
 *   gap=leader|interval   Abstand zum Klassenfuehrer oder zum Auto davor (nur Rennen)
 *   names=short|full|tla  Namensformat
 *   scale=1     Groesse
 *   debug=1     auch alte/keine Live-Daten anzeigen
 */
export default function Tower() {
  const { params, snapshot, connection, debug } = useOverlayData();
  const max = num(params, "max", 15);
  const scale = num(params, "scale", 1);
  const onlyClass = params?.get("cls") ?? undefined;
  const gapMode = params?.get("gap") === "interval" ? "interval" : "leader";
  const nameMode = (["full", "short", "tla"].includes(params?.get("names") ?? "")
    ? params!.get("names")
    : "short") as "full" | "short" | "tla";

  if (!snapshot) {
    return debug ? <div className="ov" style={{ fontSize: 14 }}>Tower: keine Live-Daten ({connection})</div> : null;
  }

  const kind = sessionKind(snapshot.session.type);
  const groups = buildGroups(snapshot.cars, kind, onlyClass);
  const fastest = overallFastest(snapshot.cars);

  return (
    <div className="ov tw" style={{ fontSize: 16 * scale }}>
      <div className="tw-top">
        <div className="tw-brand"><span className="ov-logo"><b>FLM</b><small>Broadcast</small></span></div>
        <div className="tw-slash" />
        <div className="tw-title">{sessionLabel(snapshot.session.type)}</div>
        {kind === "race" ? (
          <div className="tw-clock ov-num">{snapshot.session.remaining > 0 ? fmtClock(snapshot.session.remaining) : "--"}</div>
        ) : (
          <div className="tw-clock fl ov-num">
            {fastest ? `${fmtTime(fastest.bestLap)}  #${fastest.num ?? "–"} ${shortName(fastest.driver, "tla")}` : "–"}
          </div>
        )}
      </div>
      <div className="tw-list">
        {groups.map((g) => (
          <div key={g.cls}>
            <div className="tw-class" style={{ ["--c" as string]: classColor(g.cls) }}>
              <div className="tw-stripes"><i /><i /></div>
              <b>{classLabel(g.cls)}</b>
              {kind !== "race" && g.bestLap != null && <span className="best ov-num">{fmtTime(g.bestLap)}</span>}
            </div>
            {g.rows.slice(0, max).map((r) => {
              const c = r.car;
              let right: string;
              if (kind === "race") {
                right = r.classPos === 1 ? "LEADER" : gapMode === "interval" ? r.gapInterval : r.gapLeader;
              } else {
                right = r.classPos === 1 ? fmtTime(c.bestLap) : r.gapLeader;
              }
              return (
                <div className={`tw-row${r.classPos === 1 && kind !== "race" ? " lead" : ""}`} key={c.id}>
                  <div className="tw-pos ov-num">{r.classPos}</div>
                  <div className="tw-no ov-num">{c.num ?? "–"}</div>
                  <div className="tw-name">{shortName(c.driver, nameMode)}</div>
                  <div className="tw-gap ov-num">
                    {c.inPits ? <span className="tw-pit">BOX</span> : right}
                    {c.yellowCause && <span className="tw-yel">GELB</span>}
                  </div>
                  {c.tire ? <Tires tire={c.tire} overlay /> : <div />}
                </div>
              );
            })}
          </div>
        ))}
        <div className="tw-foot">{snapshot.session.track}</div>
      </div>
    </div>
  );
}
