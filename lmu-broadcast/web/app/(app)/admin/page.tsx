"use client";

import { useCallback, useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { ROLES, type Profile } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

type Tab = "users" | "keys" | "tracks";

function Users() {
  const { profile: me } = useAuth();
  const supabase = getSupabase()!;
  const [users, setUsers] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("id, display_name, ingame_name, role").order("display_name");
    if (error) setError(error.message);
    else setUsers((data as Profile[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function setRole(id: string, role: string) {
    setError("");
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) setError(error.message);
    await load();
  }

  const shown = users.filter((u) => `${u.display_name} ${u.ingame_name ?? ""}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <div className="toolbar">
        <input placeholder="Suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted">Rollen bekommen Nutzer normalerweise selbst bei der Anmeldung. Hier kannst du sie nachträglich ändern.</span>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="tablewrap">
        <table className="plain">
          <thead><tr><th>Anzeigename</th><th>In-Game-Name</th><th>Rolle</th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td>{u.display_name || "–"}</td>
                <td>{u.ingame_name ?? <span className="muted">fehlt noch</span>}</td>
                <td>
                  <select
                    value={u.role ?? ""}
                    disabled={u.id === me?.id}
                    title={u.id === me?.id ? "Die eigene Rolle kannst du hier nicht ändern" : ""}
                    onChange={(e) => e.target.value && setRole(u.id, e.target.value)}
                    style={{ minWidth: 220 }}
                  >
                    {!u.role && <option value="">Wartet auf Rollenwahl</option>}
                    {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const KEY_INFO: { role: string; title: string; text: string }[] = [
  { role: "admin", title: "Admin-Key", text: "Gibt volle Rechte. Nur an Leute geben, die Events anlegen und Rollen verwalten sollen." },
  { role: "steward", title: "Steward-Key", text: "Für die Rennleitung: Vorfälle prüfen und Strafen vergeben." },
  { role: "broadcaster", title: "Broadcast-Key", text: "Für Kommentatoren und Streamer: Live-Daten und Overlays." },
];

function Keys() {
  const supabase = getSupabase()!;
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("access_codes").select("role, code");
    if (error) setError(error.message);
    else setCodes(Object.fromEntries(((data as { role: string; code: string }[]) ?? []).map((r) => [r.role, r.code])));
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function regenerate(role: string) {
    if (!confirm("Neuen Key erzeugen? Der alte Key funktioniert danach nicht mehr. Wer die Rolle schon hat, behält sie.")) return;
    const { error } = await supabase.rpc("regenerate_access_code", { p_role: role });
    if (error) setError(error.message);
    await load();
  }

  return (
    <>
      <div className="notice">Pro Rolle gibt es einen Key, er gilt für alle Events. Fahrer brauchen keinen Key, sie nutzen den Event-Code des jeweiligen Events.</div>
      {error && <div className="err">{error}</div>}
      <div className="grid3">
        {KEY_INFO.map((k) => (
          <div className="panel" key={k.role} style={{ margin: 0 }}>
            <h3>{k.title}</h3>
            <p className="muted" style={{ margin: "2px 0 10px" }}>{k.text}</p>
            <div className="codebox" style={{ fontSize: 15 }}>{shown[k.role] ? codes[k.role] ?? "…" : "••••-••••-••••-••••"}</div>
            <div className="row" style={{ marginTop: 10 }}>
              <button onClick={() => setShown({ ...shown, [k.role]: !shown[k.role] })}>{shown[k.role] ? "Verbergen" : "Anzeigen"}</button>
              {codes[k.role] && <CopyButton text={codes[k.role]} />}
              <button className="danger" onClick={() => regenerate(k.role)}>Neu erzeugen</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

type TrackRow = { slug: string; name: string; length: number | null; coverage: number; updated_at: string };

function Tracks() {
  const supabase = getSupabase()!;
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("tracks").select("slug, name, length, coverage, updated_at").order("name");
    if (error) setError(error.message);
    else setTracks((data as TrackRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(t: TrackRow) {
    if (!confirm(`Streckenkarte „${t.name}“ löschen? Der Reader nimmt sie neu auf, sobald jemand mit laufendem Reader eine Runde fährt.`)) return;
    const { error } = await supabase.from("tracks").delete().eq("slug", t.slug);
    if (error) setError(error.message);
    await load();
  }

  return (
    <>
      <div className="notice">Strecken legt der Reader selbst an: Sobald jemand mit laufendem Reader eine unbekannte Strecke fährt, wird sie aufgezeichnet und erscheint hier und bei der Event-Erstellung.</div>
      {error && <div className="err">{error}</div>}
      {tracks.length === 0 ? (
        <div className="notice">Noch keine Strecke aufgezeichnet.</div>
      ) : (
        <div className="tablewrap">
          <table className="plain">
            <thead><tr><th>Strecke</th><th className="num">Länge</th><th className="num">Abdeckung</th><th>Aufgenommen</th><th /></tr></thead>
            <tbody>
              {tracks.map((t) => (
                <tr key={t.slug}>
                  <td><b>{t.name}</b></td>
                  <td className="num">{t.length ? `${(t.length / 1000).toFixed(2)} km` : "–"}</td>
                  <td className="num">{Math.round(t.coverage * 100)} %</td>
                  <td>{new Date(t.updated_at).toLocaleDateString("de-DE")}</td>
                  <td><button className="danger" onClick={() => remove(t)}>Löschen / neu aufnehmen</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AdminArea() {
  const [tab, setTab] = useState<Tab>("users");
  const tabs: [Tab, string][] = [["users", "Benutzer"], ["keys", "Keys"], ["tracks", "Strecken"]];
  return (
    <>
      <div className="page-title"><h1>Admin</h1></div>
      <div className="tabs">
        {tabs.map(([key, label]) => (
          <div key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</div>
        ))}
      </div>
      <div className="tabbody">
        {tab === "users" && <Users />}
        {tab === "keys" && <Keys />}
        {tab === "tracks" && <Tracks />}
      </div>
    </>
  );
}

export default function Admin() {
  return (
    <RequireAuth roles={["admin"]}>
      <AdminArea />
    </RequireAuth>
  );
}
