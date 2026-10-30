import { classColor, classRank } from "@/lib/classes";

/** Startnummer als farbiges Schild: Farbe nach Klasse (Hypercar rot, LMP2 blau, LMGT3 grün). Ohne bekannte Klasse gelb. */
export default function CarNo({ num, cls }: { num: number | null | undefined; cls?: string | null }) {
  const known = !!cls && classRank(cls) !== 9;
  return (
    <span className="carno" style={known ? { background: classColor(cls!), color: "#fff" } : undefined}>
      {num ?? "–"}
    </span>
  );
}
