"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

export default function ProfileForm({ embedded }: { embedded?: boolean }) {
  const { profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [ingame, setIngame] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setIngame(profile.ingame_name ?? "");
    }
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !profile) return;
    if (!ingame.trim()) {
      setError("Bitte gib deinen In-Game-Namen an.");
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim(), ingame_name: ingame.trim() })
      .eq("id", profile.id);
    if (error) {
      setError(error.code === "23505" ? "Dieser In-Game-Name ist schon mit einem anderen Konto verknüpft. Wende dich an einen Admin." : error.message);
    } else {
      await refreshProfile();
      setSaved(true);
    }
    setBusy(false);
  }

  return (
    <>
      {embedded ? <h3 style={{ margin: "0 0 4px" }}>Dein Konto</h3> : (
        <div className="page-title">
          <div>
            <h1>Dein Profil</h1>
            <p>Rolle: {profile?.role ? ROLES[profile.role] : "–"}</p>
          </div>
        </div>
      )}
      {embedded && <p className="muted" style={{ margin: "0 0 10px" }}>Rolle: {profile?.role ? ROLES[profile.role] : "–"}</p>}
      <form className="panel" onSubmit={save} style={{ maxWidth: 520 }}>
        <label style={{ marginTop: 0 }}>Anzeigename</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={{ width: "100%" }} />
        <label>In-Game-Name</label>
        <input value={ingame} onChange={(e) => setIngame(e.target.value)} required style={{ width: "100%" }} />
        {error && <div className="err">{error}</div>}
        {saved && <div className="okmsg">Gespeichert.</div>}
        <div style={{ marginTop: 14 }}><button className="primary" disabled={busy}>Speichern</button></div>
      </form>
    </>
  );
}

