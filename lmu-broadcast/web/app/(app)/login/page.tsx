"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export default function Login() {
  const supabase = getSupabase();
  const { session, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!loading && session) router.replace("/events");
  }, [loading, session, router]);

  if (!supabase) {
    return <div className="notice">Supabase ist nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY fehlen).</div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setInfo("");
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/events` },
      });
      if (error) setError(error.message);
      else if (!data.session) setInfo("Fast geschafft: Wir haben dir eine Bestätigungs-E-Mail geschickt. Klicke den Link darin und melde dich dann an.");
    }
    setBusy(false);
  }

  async function discord() {
    if (!supabase) return;
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}/events` },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="panel" style={{ maxWidth: 420, margin: "24px auto" }}>
      <h2 style={{ marginTop: 0 }}>{mode === "in" ? "Anmelden" : "Konto erstellen"}</h2>
      <button className="primary" style={{ width: "100%" }} onClick={discord}>Mit Discord fortfahren</button>
      <div className="muted" style={{ textAlign: "center", margin: "12px 0" }}>oder mit E-Mail</div>
      <form onSubmit={submit}>
        {mode === "up" && (
          <>
            <label>Anzeigename</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
          </>
        )}
        <label>E-Mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%" }} />
        <label>Passwort</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ width: "100%" }} />
        {error && <div className="err">{error}</div>}
        {info && <div className="okmsg">{info}</div>}
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          <button className="primary" disabled={busy}>{mode === "in" ? "Anmelden" : "Registrieren"}</button>
          <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); setInfo(""); }}>
            {mode === "in" ? "Neues Konto" : "Ich habe schon ein Konto"}
          </button>
        </div>
      </form>
      <p className="muted" style={{ fontSize: 12 }}>
        Nach der Anmeldung gibst du deinen In-Game-Namen an. Damit ordnet die Rennleitung dich im Spiel zu.
      </p>
    </div>
  );
}
