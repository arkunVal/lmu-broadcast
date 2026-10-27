"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

function ProfileForm() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [ingame, setIngame] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const firstTime = !profile?.ingame_name;

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
      if (firstTime) router.replace("/events");
    }
    setBusy(false);
  }

  return (
    <div className="panel" style={{ maxWidth: 480, margin: "24px auto" }}>
      <h2 style={{ marginTop: 0 }}>{firstTime ? "Fast fertig: dein In-Game-Name" : "Dein Profil"}</h2>
      {firstTime && (
        <p className="muted">
          Trage genau den Namen ein, den du in Le Mans Ultimate benutzt. So kann die Rennleitung deine Fahrten, Vorfälle und Strafen deinem Konto zuordnen.
        </p>
      )}
      <form onSubmit={save}>
        <label>Anzeigename</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={{ width: "100%" }} />
        <label>In-Game-Name (Pflicht)</label>
        <input value={ingame} onChange={(e) => setIngame(e.target.value)} required style={{ width: "100%" }} />
        {error && <div className="err">{error}</div>}
        {saved && <div className="okmsg">Gespeichert.</div>}
        <div style={{ marginTop: 12 }}>
          <button className="primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    </div>
  );
}

export default function Profil() {
  return (
    <RequireAuth>
      <ProfileForm />
    </RequireAuth>
  );
}
