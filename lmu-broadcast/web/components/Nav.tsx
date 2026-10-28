"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@/lib/labels";

export default function Nav() {
  const { session, profile, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const ready = !!session && !!profile?.role;
  return (
    <header>
      <div className="bar">
        <div className="bar-in">
          <Link className="brand" href={ready ? "/events" : "/"}>LMU <i>Rennleitung</i></Link>
          <nav>
            {ready && <Link href="/events" className={path.startsWith("/events") ? "on" : ""}>Events</Link>}
            {profile?.role === "admin" && <Link href="/admin" className={path.startsWith("/admin") ? "on" : ""}>Admin</Link>}
            {ready && (
              <>
                <Link href="/profil" className={`who ${path === "/profil" ? "on" : ""}`} style={{ padding: "6px 10px" }}>
                  {profile?.ingame_name || profile?.display_name} · {profile?.role ? ROLES[profile.role] : ""}
                </Link>
                <button
                  onClick={async () => {
                    await signOut();
                    router.replace("/");
                  }}
                >
                  Abmelden
                </button>
              </>
            )}
            {!session && <Link href="/login">Anmelden</Link>}
          </nav>
        </div>
      </div>
      <div className="kerb" />
    </header>
  );
}
