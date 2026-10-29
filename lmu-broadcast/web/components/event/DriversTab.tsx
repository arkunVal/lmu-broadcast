"use client";

import { useState } from "react";
import { type EventDriver, type EventRow } from "@/lib/labels";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export default function DriversTab({
  event, drivers, isStaff, reload,
}: {
  event: EventRow; drivers: EventDriver[]; isStaff: boolean; reload: () => void;
}) {
  const { profile } = useAuth();
  const supabase = getSupabase()!;
  const [form, setForm] = useState({ ingame_name: "", car_number: "", car_class: "", team: "" });
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [newMember, setNewMember] = useState("");
  const [teamErr, setTeamErr] = useState("");

  const captain = drivers.find((d) => d.is_captain && d.profile_id && d.profile_id === profile?.id && d.team_id);
  const myTeam = captain ? drivers.filter((d) => d.team_id === captain.team_id) : [];

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!captain?.team_id) return;
    setTeamErr("");
    const { error } = await supabase.rpc("team_add_member", { p_team: captain.team_id, p_name: newMember.trim() });
    if (error) setTeamErr(error.message);
    else setNewMember("");
    reload();
  }

  async function removeMember(id: string) {
    setTeamErr("");
    const { error } = await supabase.rpc("team_remove_member", { p_driver: id });
    if (error) setTeamErr(error.message);
    reload();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await supabase.from("event_drivers").insert({
      event_id: event.id,
      ingame_name: form.ingame_name.trim(),
      car_number: form.car_number ? Number(form.car_number) : null,
      car_class: form.car_class.trim() || null,
      team: form.team.trim() || null,
    });
    if (error) setError(error.code === "23505" ? "Dieser Fahrer ist schon eingetragen." : error.message);
    else setForm({ ingame_name: "", car_number: "", car_class: "", team: "" });
    reload();
  }

  async function importBulk() {
    setError("");
    setMsg("");
    const rows = bulk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, nr, cls, team] = l.split(/[;\t]/).map((s) => s.trim());
        return {
          event_id: event.id,
          ingame_name: name,
          car_number: nr && !isNaN(Number(nr)) ? Number(nr) : null,
          car_class: cls || null,
          team: team || null,
        };
      })
      .filter((r) => r.ingame_name);
    if (!rows.length) return;
    const have = new Set(drivers.map((d) => d.ingame_name.toLowerCase()));
    const fresh = rows.filter((r, i) => !have.has(r.ingame_name.toLowerCase()) && rows.findIndex((x) => x.ingame_name.toLowerCase() === r.ingame_name.toLowerCase()) === i);
    if (fresh.length) {
      const { error } = await supabase.from("event_drivers").insert(fresh);
      if (error) {
        setError(error.message);
        return;
      }
    }
    setMsg(`${fresh.length} Fahrer importiert, ${rows.length - fresh.length} übersprungen (schon vorhanden).`);
    setBulk("");
    reload();
  }

  async function remove(id: string) {
    await supabase.from("event_drivers").delete().eq("id", id);
    reload();
  }

  return (
    <div className={isStaff || captain ? "split b" : "split full"}>
      {!isStaff && captain && (
        <div className="panel">
          <h3>Mein Team: {captain.team}</h3>
          <p className="muted" style={{ margin: "2px 0 10px" }}>Trage deine Teammitglieder mit ihrem In-Game-Namen ein. Wer danach den Event-Code eingibt, landet automatisch in deinem Team.</p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 0, listStyle: "none" }}>
            {myTeam.map((m) => (
              <li key={m.id} className="row" style={{ justifyContent: "space-between", padding: "4px 0" }}>
                <span><b>{m.ingame_name}</b> <span className="muted" style={{ fontSize: 13 }}>{m.is_captain ? "Kapitän" : m.profile_id ? "angemeldet" : "noch nicht beigetreten"}</span></span>
                {!m.is_captain && <button className="danger" onClick={() => removeMember(m.id)}>Entfernen</button>}
              </li>
            ))}
          </ul>
          <form onSubmit={addMember} className="row" style={{ flexWrap: "nowrap" }}>
            <input value={newMember} onChange={(e) => setNewMember(e.target.value)} required placeholder="In-Game-Name" style={{ flex: 1, minWidth: 0 }} />
            <button className="primary">Hinzufügen</button>
          </form>
          {teamErr && <div className="err">{teamErr}</div>}
        </div>
      )}
      {isStaff && (
        <div className="panel">
          <h3>Fahrer eintragen</h3>
          <form onSubmit={add}>
            <div className="grid2">
              <div><label>In-Game-Name</label><input required value={form.ingame_name} onChange={(e) => setForm({ ...form, ingame_name: e.target.value })} style={{ width: "100%" }} /></div>
              <div><label>Startnummer</label><input type="number" value={form.car_number} onChange={(e) => setForm({ ...form, car_number: e.target.value })} style={{ width: "100%" }} /></div>
              <div><label>Klasse</label>{(event.classes ?? []).length > 0 ? (
                <select value={form.car_class} onChange={(e) => setForm({ ...form, car_class: e.target.value })} style={{ width: "100%" }}>
                  <option value="">–</option>
                  {(event.classes ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : <input value={form.car_class} onChange={(e) => setForm({ ...form, car_class: e.target.value })} placeholder="Hypercar, LMP2, GT3 …" style={{ width: "100%" }} />}</div>
              <div><label>Team</label><input value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} style={{ width: "100%" }} /></div>
            </div>
            <div style={{ marginTop: 10 }}><button className="primary">Hinzufügen</button></div>
          </form>
          <details style={{ marginTop: 12 }}>
            <summary className="muted">Ganze Liste einfügen (eine Zeile je Fahrer)</summary>
            <label>Format: Name; Startnummer; Klasse; Team</label>
            <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Max Becker; 8; Hypercar; Team Alpha\nLena Vogt; 50; Hypercar"} style={{ minHeight: 120 }} />
            <div style={{ marginTop: 8 }}><button onClick={importBulk}>Importieren</button></div>
          </details>
          {error && <div className="err">{error}</div>}
          {msg && <div className="okmsg">{msg}</div>}
        </div>
      )}
      <div className="tablewrap">
        <table className="plain">
          <thead>
            <tr><th>Nr</th><th>In-Game-Name</th><th>Klasse</th><th>Team</th><th>Status</th>{isStaff && <th />}</tr>
          </thead>
          <tbody>
            {drivers.length === 0 && <tr><td colSpan={6} className="muted">Noch keine Fahrer eingetragen.</td></tr>}
            {drivers.map((d) => {
              return (
                <tr key={d.id}>
                  <td>{d.car_number ?? "–"}</td>
                  <td>{d.ingame_name}</td>
                  <td>{d.car_class ?? "–"}</td>
                  <td>{d.team ?? "–"}</td>
                  <td>{d.profile_id ? <span className="badge closed">angemeldet{d.is_captain ? " · Kapitän" : ""}</span> : <span className="muted">{d.team_id ? "eingetragen, noch nicht beigetreten" : "nur eingetragen"}</span>}</td>
                  {isStaff && <td><button className="danger" onClick={() => remove(d.id)}>Entfernen</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
