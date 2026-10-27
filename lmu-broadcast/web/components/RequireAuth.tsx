"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import type { Profile } from "@/lib/labels";

/** Schützt eine Seite: Login nötig, In-Game-Name nötig, optional nur bestimmte Rollen. */
export default function RequireAuth({
  roles,
  children,
}: {
  roles?: Profile["role"][];
  children: React.ReactNode;
}) {
  const { configured, loading, session, profile } = useAuth();
  const router = useRouter();
  const path = usePathname();

  const needsName = !!session && !!profile && !profile.ingame_name?.trim();

  useEffect(() => {
    if (loading || !configured) return;
    if (!session) router.replace("/login");
    else if (needsName && path !== "/profil") router.replace("/profil");
  }, [loading, configured, session, needsName, path, router]);

  if (!configured) {
    return <div className="notice">Supabase ist nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY fehlen).</div>;
  }
  if (loading || !session || (session && !profile)) {
    return <div className="notice">Lade …</div>;
  }
  if (needsName && path !== "/profil") return <div className="notice">Weiterleitung …</div>;
  if (roles && profile && !roles.includes(profile.role)) {
    return (
      <div className="notice">
        Für diese Seite fehlt dir die Berechtigung. <Link href="/events">Zurück zu den Events</Link>
      </div>
    );
  }
  return <>{children}</>;
}
