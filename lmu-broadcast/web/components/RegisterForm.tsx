"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

type Info = {
  id: string;
  name: string;
  track: string | null;
  classes: string[];
  is_team_event: boolean;
  teams: { name: string; car_class: string | null; car_number: number | null }[];
};

/**
 * Anmeldung für ein Event:
 *  1. Event-Code eingeben, "Weiter" holt Name, Klassen und ob es ein Team-Event ist.
 *  2. Solo-Event:  In-Game-Name (aus dem Konto, sonst eintragen), Klasse (Auswahl vom Admin), Startnummer.
 *     Team-Event:  entweder neues Team anmelden (Teamname, Klasse, Nummer, Teammitglieder) oder als Mitglied beitreten,
 *                  wenn der Teamkapitän einen schon mit dem In-Game-Namen eingetragen hat.
 */
export default function RegisterForm({ onDone }: { onDone: (eventId: string) => void }) {
  const { profile, refreshProfile } = useAuth();
  const supabase = getSupabase();
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [ingame, setIngame] = useState("");
  const [cls, setCls] = useState("");
  const [number, setNumber] = useState("");
  const [mode, setMode] = useState<"team" | "member">("team");
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const knownName = profile?.ingame_name ?? "";

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("event_info", { p_code: code });
    setBusy(false);
    if (error) {
      setError(error.message.includes("event_info") ? "Datenbank-Update fehlt: supabase/repair.sql ausführen." : error.message);
      return;
    }
    const i = data as Info;
    setInfo({ ...i, classes: i.classes ?? [], teams: i.teams ?? [] });
    setCls("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !info) return;
    setBusy(true);
    setError("");
    const memberMode = info.is_team_event && mode === "member";
    const { data, error } = await supabase.rpc("register_for_event", {
      p_code: code,
      p_ingame_name: knownName ? null : ingame.trim(),
      p_class: memberMode ? null : cls || null,
      p_number: memberMode || !number ? null : Number(number),
      p_team_name: info.is_team_event && !memberMode ? teamName.trim() : null,
      p_members: info.is_team_event && !memberMode ? members.split(/[\n,;]/).map((m) => m.trim()).filter(Boolean) : [],
    });
    if (error) {
      setError(error.message.includes("register_for_event") ? "Datenbank-Update fehlt: supabase/repair.sql ausführen." : error.message);
      setBusy(false);
      return;
    }
    await refreshProfile();
    setBusy(false);
    onDone(data as string);
  }

  if (!info) {
    return (
      <form onSubmit={lookup}>
        <label>Event-Code</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="EVT-XXXX-XXXX" style={{ flex: 1, minWidth: 0 }} autoFocus />
          <button className="primary" disabled={busy}>Weiter</button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>Den Code bekommst du von der Rennleitung.</p>
        {error && <div className="err">{error}</div>}
      </form>
    );
  }

  const memberMode = info.is_team_event && mode === "member";
  const classSelect = (
    <>
      <label>Klasse</label>
      {info.classes.length > 0 ? (
        <select value={cls} onChange={(e) => setCls(e.target.value)} required>
          <option value="">Klasse wählen …</option>
          {info.classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <input value={cls} onChange={(e) => setCls(e.target.value)} placeholder="z. B. Hypercar (optional)" style={{ width: "100%" }} />
      )}
    </>
  );

  return (
    <form onSubmit={submit}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <b style={{ fontSize: 18 }}>{info.name}</b>
          <div className="muted" style={{ fontSize: 13 }}>{info.track ?? "Strecke noch offen"}{info.is_team_event ? " · Team-Event" : ""}</div>
        </div>
        <button type="button" onClick={() => { setInfo(null); setError(""); }}>Anderer Code</button>
      </div>

      {knownName ? (
        <p style={{ margin: "10px 0 0" }}>
          <span className="muted">In-Game-Name:</span> <b>{knownName}</b>
          <span className="muted" style={{ fontSize: 13 }}> (aus deinem Konto, änderbar unter Profil)</span>
        </p>
      ) : (
        <>
          <label>In-Game-Name</label>
          <input value={ingame} onChange={(e) => setIngame(e.target.value)} required style={{ width: "100%" }} />
          <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>Genau der Name aus Le Mans Ultimate. Er wird in deinem Konto gespeichert.</p>
        </>
      )}

      {info.is_team_event && (
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className={mode === "team" ? "primary" : ""} onClick={() => setMode("team")}>Neues Team anmelden</button>
          <button type="button" className={mode === "member" ? "primary" : ""} onClick={() => setMode("member")}>Ich bin Teammitglied</button>
        </div>
      )}

      {memberMode ? (
        <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>
          Dein Teamkapitän trägt dich mit deinem In-Game-Namen in sein Team ein. Mit dem Event-Code wirst du dann automatisch deinem Team zugeordnet, Klasse und Startnummer gelten für das ganze Team.
          {info.teams.length > 0 && <> Schon angemeldete Teams: {info.teams.map((t) => `${t.name}${t.car_number != null ? ` (#${t.car_number})` : ""}`).join(", ")}.</>}
        </div>
      ) : (
        <>
          {info.is_team_event && (
            <>
              <label>Teamname</label>
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required style={{ width: "100%" }} />
            </>
          )}
          {classSelect}
          <label>{info.is_team_event ? "Startnummer des Teams" : "Startnummer"}</label>
          <input type="number" min={1} max={999} value={number} onChange={(e) => setNumber(e.target.value)} required style={{ width: 140 }} />
          {info.is_team_event && (
            <>
              <label>Teammitglieder (In-Game-Namen, eine pro Zeile)</label>
              <textarea value={members} onChange={(e) => setMembers(e.target.value)} placeholder={"Lena Vogt\nTom Becker"} />
              <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>Du bist automatisch Kapitän und Fahrer. Deine Teammitglieder geben danach nur den Event-Code ein, den Rest erledigt das System. Weitere Mitglieder kannst du später im Reiter „Fahrer“ nachtragen.</p>
            </>
          )}
        </>
      )}

      {error && <div className="err">{error}</div>}
      <div style={{ marginTop: 14 }}><button className="primary" disabled={busy}>{memberMode ? "Dem Team beitreten" : info.is_team_event ? "Team anmelden" : "Anmelden"}</button></div>
    </form>
  );
}
