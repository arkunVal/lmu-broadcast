"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@/lib/labels";

export default function Nav() {
  const { session, profile, signOut } = useAuth();
  const router = useRouter();
  return (
    <div className="top">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h1>LMU Rennleitung</h1>
        {session && <Link className="chip" href="/events">Events</Link>}
        {profile?.role === "admin" && <Link className="chip" href="/admin">Admin</Link>}
        <Link className="chip" href="/overlays">OBS-Overlays</Link>
        <Link className="chip" href="/">Livetest</Link>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {session && profile && (
          <>
            <Link className="chip" href="/profil">
              {profile.display_name || "Profil"}
              {profile.ingame_name ? ` · ${profile.ingame_name}` : ""} · {ROLES[profile.role]}
            </Link>
            <button
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              Abmelden
            </button>
          </>
        )}
      </div>
    </div>
  );
}
