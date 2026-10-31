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
    if (new URLSearchParams(window.location.search).get("neu") === "1") setMode("up");
  }, []);

  const [fresh, setFresh] = useState(false);
  // Nur nach einem Login hier weiterleiten. Wer schon angemeldet ist und den Link öffnet, bleibt auf der Startseite.
  useEffect(() => {
    if (!loading && session && fresh) router.replace("/events");
  }, [loading, session, fresh, router]);

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
      else setFresh(true);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/events` },
      });
      if (error) setError(error.message);
      else if (!data.session) setInfo("Fast geschafft: Wir haben dir eine Bestätigungs-E-Mail geschickt. Klicke den Link darin, dann geht es weiter mit der Rollenwahl.");
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

  if (!loading && session && !fresh) {
    return (
      <div className="panel auth-box">
        <h2>Willkommen zurück</h2>
        <p className="muted" style={{ margin: "4px 0 14px" }}>Du bist angemeldet.</p>
        <button className="primary" style={{ width: "100%", padding: 10 }} onClick={() => router.push("/events")}>Zu den Events</button>
        <button style={{ width: "100%", padding: 10, marginTop: 8 }} onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </div>
    );
  }

  return (
    <div className="panel auth-box">
      <h2>{mode === "in" ? "Anmelden" : "Konto erstellen"}</h2>
      <p className="muted" style={{ margin: "4px 0 14px" }}>
        {mode === "in" ? "Willkommen zurück." : "Danach wählst du deine Rolle und gibst deinen Code ein."}
      </p>
      <button className="primary" style={{ width: "100%", padding: 10 }} onClick={discord}>Mit Discord fortfahren</button>
      <div className="muted" style={{ textAlign: "center", margin: "14px 0 0" }}>oder mit E-Mail</div>
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
        <div className="row" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <button className="primary" disabled={busy}>{mode === "in" ? "Anmelden" : "Registrieren"}</button>
          <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); setInfo(""); }}>
            {mode === "in" ? "Neues Konto" : "Ich habe schon ein Konto"}
          </button>
        </div>
      </form>
    </div>
  );
}
