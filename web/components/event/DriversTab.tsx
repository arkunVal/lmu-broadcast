"use client";

import { useEffect, useState } from "react";
import { sameName, type EventDriver, type EventRow } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

type Acc = { display_name: string; ingame_name: string | null };

export default function DriversTab({
  event, drivers, isStaff, reload,
}: {
  event: EventRow; drivers: EventDriver[]; isStaff: boolean; reload: () => void;
}) {
  const supabase = getSupabase()!;
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [form, setForm] = useState({ ingame_name: "", car_number: "", car_class: "", team: "" });
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("display_name, ingame_name").then(({ data }) => setAccounts((data as Acc[]) ?? []));
  }, [supabase]);

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
    <>
      {isStaff && (
        <div className="panel">
          <b>Fahrer eintragen</b>
          <form onSubmit={add}>
            <div className="grid2">
              <div><label>In-Game-Name</label><input required value={form.ingame_name} onChange={(e) => setForm({ ...form, ingame_name: e.target.value })} style={{ width: "100%" }} /></div>
              <div><label>Startnummer</label><input type="number" value={form.car_number} onChange={(e) => setForm({ ...form, car_number: e.target.value })} style={{ width: "100%" }} /></div>
              <div><label>Klasse</label><input value={form.car_class} onChange={(e) => setForm({ ...form, car_class: e.target.value })} placeholder="Hypercar, LMP2, GT3 …" style={{ width: "100%" }} /></div>
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
            <tr><th>Nr</th><th>In-Game-Name</th><th>Klasse</th><th>Team</th><th>Konto</th>{isStaff && <th />}</tr>
          </thead>
          <tbody>
            {drivers.length === 0 && <tr><td colSpan={6} className="muted">Noch keine Fahrer eingetragen.</td></tr>}
            {drivers.map((d) => {
              const acc = accounts.find((a) => sameName(a.ingame_name, d.ingame_name));
              return (
                <tr key={d.id}>
                  <td>{d.car_number ?? "–"}</td>
                  <td>{d.ingame_name}</td>
                  <td>{d.car_class ?? "–"}</td>
                  <td>{d.team ?? "–"}</td>
                  <td>{acc ? <span className="badge closed">verknüpft: {acc.display_name || "Konto"}</span> : <span className="muted">kein Konto</span>}</td>
                  {isStaff && <td><button className="danger" onClick={() => remove(d.id)}>Entfernen</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
