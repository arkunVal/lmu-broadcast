"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LangSwitch } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="authpage">
      <div className="auth-hero">
        <div className="auth-logo"><span className="lg-top"><i /><b>FLM</b><i /></span><small>Broadcast</small></div>
        <h1>Dein Rennen.<br />Unter Kontrolle.</h1>
        <p>Live-Daten, TV-Overlays und Rennleitung für Le Mans Ultimate. Im Browser, auf jedem Gerät.</p>
        <ul>
          <li><i />Broadcast und Streckenkarte</li>
          <li><i />Vorfälle, Strafen und Funk für die Rennleitung</li>
          <li><i />Broadcast-Overlays direkt für OBS</li>
        </ul>
      </div>
      <div className="auth-card"><div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><LangSwitch /></div>{children}</div>
    </div>
  );
}

export default function Login() {
  const [showPw, setShowPw] = useState(false);
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
      <Frame>
        <h2>Willkommen zurück</h2>
        <p className="muted" style={{ margin: "4px 0 18px" }}>Du bist angemeldet.</p>
        <button className="primary" style={{ width: "100%", padding: 12 }} onClick={() => router.push("/events")}>Zu den Events</button>
        <button style={{ width: "100%", padding: 12, marginTop: 10 }} onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </Frame>
    );
  }

  return (
    <Frame>
      <h2>{mode === "in" ? "Willkommen zurück" : "Konto erstellen"}</h2>
      <p className="muted" style={{ margin: "4px 0 16px" }}>
        {mode === "in" ? "Melde dich an, um dein Event zu sehen." : "Danach wählst du deine Rolle und gibst deinen Code ein."}
      </p>
      <div className="seg2" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "in"} className={mode === "in" ? "on" : ""} onClick={() => { setMode("in"); setError(""); setInfo(""); }}>Anmelden</button>
        <button type="button" role="tab" aria-selected={mode === "up"} className={mode === "up" ? "on" : ""} onClick={() => { setMode("up"); setError(""); setInfo(""); }}>Registrieren</button>
      </div>
      <form onSubmit={submit}>
        {mode === "up" && (
          <>
            <label>Anzeigename</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
          </>
        )}
        <label>E-Mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%" }} autoComplete="email" />
        <label>Passwort</label>
        <div className="pwwrap">
          <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ width: "100%" }} autoComplete={mode === "in" ? "current-password" : "new-password"} />
          <button type="button" className="eye" aria-label={showPw ? "Passwort verbergen" : "Passwort zeigen"} onClick={() => setShowPw((v) => !v)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />{showPw && <path d="M4 4l16 16" />}</svg>
          </button>
        </div>
        {error && <div className="err">{error}</div>}
        {info && <div className="okmsg">{info}</div>}
        <button className="primary" disabled={busy} style={{ width: "100%", padding: 12, marginTop: 16 }}>{mode === "in" ? "Anmelden" : "Registrieren"}</button>
      </form>
      <div className="or"><span>oder</span></div>
      <button style={{ width: "100%", padding: 11 }} onClick={discord}>Mit Discord fortfahren</button>
    </Frame>
  );
}
