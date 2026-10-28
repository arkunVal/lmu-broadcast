"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@/lib/labels";
import Logo from "./Logo";

const ico = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  events: ico(<><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></>),
  admin: ico(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  user: ico(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  out: ico(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />),
  chev: ico(<path d="M15 6l-6 6 6 6" />),
  burger: ico(<path d="M4 7h16M4 12h16M4 17h16" />),
};

const KEY = "flm-nav-collapsed";

/** Rahmen: einklappbare Navigation links (nur eingeloggt) und Kopfleiste. */
export default function Shell({ children }: { children: React.ReactNode }) {
  const { session, profile, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const ready = !!session && !!profile?.role;
  const [coll, setColl] = useState(false);
  const [mopen, setMopen] = useState(false);

  useEffect(() => {
    try {
      setColl(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);
  useEffect(() => setMopen(false), [path]);

  function toggle() {
    setColl((v) => {
      try {
        localStorage.setItem(KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

  const link = (href: string, label: string, icon: React.ReactNode, on: boolean) => (
    <Link href={href} title={label} className={`navlink${on ? " on" : ""}`}>{icon}<span>{label}</span></Link>
  );

  return (
    <div className={`shell${ready && coll ? " coll" : ""}${mopen ? " mopen" : ""}${ready ? "" : " guest"}`}>
      {ready && (
        <>
          <aside className="side" aria-label="Navigation">
            <button className="navlink toggle" onClick={toggle} title={coll ? "Menü ausklappen" : "Menü einklappen"} aria-expanded={!coll}>
              {I.chev}<span>Menü einklappen</span>
            </button>
            {link("/events", "Events", I.events, path.startsWith("/events"))}
            {profile?.role === "admin" && link("/admin", "Admin", I.admin, path.startsWith("/admin"))}
            {link("/profil", "Profil", I.user, path === "/profil")}
            <div className="sp" />
            <button
              className="navlink out"
              title="Abmelden"
              onClick={async () => {
                await signOut();
                router.replace("/");
              }}
            >
              {I.out}<span>Abmelden</span>
            </button>
          </aside>
          <div className="scrim" onClick={() => setMopen(false)} />
        </>
      )}
      <div className="main">
        <header className="hdr">
          <div className="hdr-l">
            {ready && <button className="burger" aria-label="Menü" onClick={() => setMopen((v) => !v)}>{I.burger}</button>}
            <Logo href={ready ? "/events" : "/"} />
          </div>
          <div className="hdr-r">
            {ready ? (
              <>
                <Link href="/profil" className="me">{profile?.ingame_name || profile?.display_name}</Link>
                <span className="rolepill">{profile?.role ? ROLES[profile.role].split(" / ")[0] : ""}</span>
              </>
            ) : (
              !session && <Link href="/login" className="link">Anmelden</Link>
            )}
          </div>
        </header>
        <div className="wrap">{children}</div>
      </div>
    </div>
  );
}
