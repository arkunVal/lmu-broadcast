import { wheelInfos } from "@/lib/standings";
import type { Car } from "@/lib/types";

const NAMES = ["vorne links", "vorne rechts", "hinten links", "hinten rechts"];

/** Vier Reifen einzeln: oben VL VR, unten HL HR (wie von oben auf das Auto gesehen). */
export default function Tires({ tire, large, overlay }: { tire: Car["tire"]; large?: boolean; overlay?: boolean }) {
  const infos = wheelInfos(tire);
  if (!infos) return <span className="muted">–</span>;
  return (
    <span className={overlay ? "tw-tires" : `tires${large ? " lg" : ""}`} title="Reifen: oben vorne links/rechts, unten hinten links/rechts">
      {infos.map((w, i) => (
        <i
          key={i}
          className={w ? "" : "none"}
          data-l={w?.letter}
          style={w ? ({ ["--c" as string]: w.color } as React.CSSProperties) : undefined}
          title={NAMES[i]}
        >
          {w?.letter ?? "?"}
        </i>
      ))}
    </span>
  );
}
