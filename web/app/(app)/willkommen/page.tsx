"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { ROLE_INFO, type Role } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

function Wizard() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [code, setCode] = useState("");
  const [ingame, setIngame] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile?.role) router.replace("/events");
  }, [profile, router]);

  const info = ROLE_INFO.find((r) => r.role === role);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !role) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("redeem_access", { p_role: role, p_code: code, p_ingame_name: ingame });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await refreshProfile();
    router.replace("/events");
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Willkommen{profile?.display_name ? `, ${profile.display_name}` : ""}</h1>
          <p>Zwei Schritte: Rolle wählen, dann Code und In-Game-Namen eintragen.</p>
        </div>
      </div>
      <h3>1. Deine Rolle</h3>
      <div className="rolegrid">
        {ROLE_INFO.map((r) => (
          <button key={r.role} type="button" className={`rolecard ${role === r.role ? "on" : ""}`} onClick={() => { setRole(r.role); setError(""); }}>
            <b>{r.title}</b>
            <span>{r.text}</span>
          </button>
        ))}
      </div>
      {info && (
        <form className="panel" onSubmit={submit} style={{ maxWidth: 560 }}>
          <h3>2. {info.codeLabel} und In-Game-Name</h3>
          <label>{info.codeLabel}</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus style={{ width: "100%" }} placeholder={info.codeHint} />
          <label>In-Game-Name</label>
          <input value={ingame} onChange={(e) => setIngame(e.target.value)} required style={{ width: "100%" }} />
          <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
            Genau der Name, den du in Le Mans Ultimate benutzt. So ordnet die Rennleitung deine Fahrten und Strafen dir zu.
          </p>
          {error && <div className="err">{error}</div>}
          <div style={{ marginTop: 14 }}><button className="primary" disabled={busy}>Fertig</button></div>
        </form>
      )}
    </>
  );
}

export default function Willkommen() {
  return (
    <RequireAuth>
      <Wizard />
    </RequireAuth>
  );
}
