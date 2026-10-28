"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import "../overlay/overlay.css";
import Tires from "@/components/Tires";
import { useAuth } from "@/lib/auth";
import { classColor } from "@/lib/classes";

const same = (c: string) => ({ wheels: [c, c, c, c], front: c, rear: c, compound: c });
const ROWS: { cls: string; label: string; cars: { pos: number; no: number; name: string; gap: string; tire: ReturnType<typeof same> }[] }[] = [
  { cls: "Hypercar", label: "HYPERCAR", cars: [
    { pos: 1, no: 8, name: "M. Becker", gap: "LEADER", tire: same("Medium") },
    { pos: 2, no: 50, name: "L. Vogt", gap: "+2.4", tire: { wheels: ["Medium", "Soft", "Medium", "Soft"], front: "Medium", rear: "Medium", compound: "Medium" } },
    { pos: 3, no: 6, name: "T. Aebi", gap: "+7.9", tire: same("Hard") },
  ] },
  { cls: "LMP2", label: "LMP2", cars: [
    { pos: 1, no: 28, name: "S. Klein", gap: "LEADER", tire: same("Soft") },
    { pos: 2, no: 34, name: "P. Wirth", gap: "+1.1", tire: same("Soft") },
  ] },
];

export default function Landing() {
  const { session, profile, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && session && profile) router.replace(profile.role ? "/events" : "/willkommen");
  }, [loading, session, profile, router]);

  return (
    <>
      <section className="hero">
        <div>
          <h1>Live-Daten und Rennleitung für Le Mans Ultimate</h1>
          <p className="lead">
            Dein Reader schickt die Daten aus dem Spiel ins Netz. Daraus werden OBS-Overlays für den Stream und ein Rennleitungs-Bereich für Vorfälle und Strafen.
          </p>
          <div className="cta">
            <Link href="/login" className="btn primary">Anmelden</Link>
            <Link href="/login?neu=1" className="btn">Konto erstellen</Link>
          </div>
        </div>
        <div className="ov tw" aria-hidden style={{ width: "26em", fontSize: 16, margin: "0 auto" }}>
          <div className="tw-top">
            <div className="tw-brand"><span className="ov-logo"><b>FLM</b><small>Broadcast</small></span></div>
            <div className="tw-slash" />
            <div className="tw-title">RENNEN</div>
            <div className="tw-clock ov-num">2:41:07</div>
          </div>
          <div className="tw-list" style={{ width: "100%" }}>
            {ROWS.map((g) => (
              <div key={g.cls}>
                <div className="tw-class" style={{ ["--c" as string]: classColor(g.cls) }}>
                  <div className="tw-stripes"><i /><i /></div>
                  <b>{g.label}</b>
                </div>
                {g.cars.map((c) => (
                  <div className="tw-row" key={c.no}>
                    <div className="tw-pos">{c.pos}</div>
                    <div className="tw-no">{c.no}</div>
                    <div className="tw-name">{c.name}</div>
                    <div className="tw-gap">{c.gap}</div>
                    <Tires tire={c.tire} overlay />
                  </div>
                ))}
              </div>
            ))}
            <div className="tw-foot">Circuit de la Sarthe</div>
          </div>
        </div>
      </section>

      <section className="steps">
        <div className="step"><div className="n">1</div><h3>Konto und Rolle</h3><p>Anmelden, Rolle wählen, Code eingeben. Fahrer brauchen den Event-Code, das Team einen Key.</p></div>
        <div className="step"><div className="n">2</div><h3>Reader starten</h3><p>Der Reader läuft auf dem Rennrechner und braucht nur einen einzigen Key aus dem Event.</p></div>
        <div className="step"><div className="n">3</div><h3>Overlays und Rennleitung</h3><p>Die Overlay-Links kommen in OBS. Vorfälle und Strafen verwaltet die Rennleitung hier.</p></div>
      </section>
    </>
  );
}
