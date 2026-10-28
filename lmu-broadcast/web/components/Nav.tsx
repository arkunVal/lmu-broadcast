"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@/lib/labels";
import Logo from "./Logo";

const I = {
  events: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg>,
  admin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  out: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>,
};

/** Seitenleiste (nur eingeloggt) und Kopfleiste. */
export default function Shell({ children }: { children: React.ReactNode }) {
  const { session, profile, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const ready = !!session && !!profile?.role;
  return (
    <div className={`shell${ready ? "" : " guest"}`}>
      {ready && (
        <aside className="side">
          <Link href="/events" title="Events" className={path.startsWith("/events") ? "on" : ""}>{I.events}</Link>
          {profile?.role === "admin" && <Link href="/admin" title="Admin" className={path.startsWith("/admin") ? "on" : ""}>{I.admin}</Link>}
          <Link href="/profil" title="Profil" className={path === "/profil" ? "on" : ""}>{I.user}</Link>
          <div className="sp" />
          <button
            title="Abmelden"
            onClick={async () => {
              await signOut();
              router.replace("/");
            }}
          >
            {I.out}
          </button>
        </aside>
      )}
      <div className="main">
        <header className="hdr">
          <Logo href={ready ? "/events" : "/"} />
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
