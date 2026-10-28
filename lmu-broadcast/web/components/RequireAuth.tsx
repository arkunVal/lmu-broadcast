"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/labels";

/** Schützt eine Seite: Login nötig, Rolle gewählt (Anmeldung abgeschlossen), optional nur bestimmte Rollen. */
export default function RequireAuth({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { configured, loading, session, profile } = useAuth();
  const router = useRouter();
  const path = usePathname();

  const needsRole = !!session && !!profile && !profile.role;

  useEffect(() => {
    if (loading || !configured) return;
    if (!session) router.replace("/login");
    else if (needsRole && path !== "/willkommen") router.replace("/willkommen");
  }, [loading, configured, session, needsRole, path, router]);

  if (!configured) {
    return <div className="notice">Supabase ist nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY fehlen).</div>;
  }
  if (loading || !session || !profile) return <div className="notice loading">Lade …</div>;
  if (needsRole && path !== "/willkommen") return <div className="notice">Weiterleitung …</div>;
  if (roles && (!profile.role || !roles.includes(profile.role))) {
    return (
      <div className="notice">
        Für diese Seite fehlt dir die Berechtigung. <Link href="/events">Zurück zu den Events</Link>
      </div>
    );
  }
  return <>{children}</>;
}
