"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { ROLES, type Profile } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

function Users() {
  const { profile: me } = useAuth();
  const supabase = getSupabase()!;
  const [users, setUsers] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, ingame_name, role")
      .order("display_name");
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
      <div className="panel">
        <b>Benutzer & Rollen</b>
        <p className="muted" style={{ margin: "4px 0 8px" }}>
          Neue Konten starten als „Fahrer“. Hier vergibst du Rennleiter-, Kommentator- und Admin-Rechte.
        </p>
        <input placeholder="Suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {error && <div className="err">{error}</div>}
      <div className="tablewrap">
        <table className="plain">
          <thead>
            <tr><th>Anzeigename</th><th>In-Game-Name</th><th>Rolle</th></tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td>{u.display_name || "–"}</td>
                <td>{u.ingame_name ?? <span className="muted">fehlt noch</span>}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={u.id === me?.id}
                    title={u.id === me?.id ? "Die eigene Rolle kannst du hier nicht ändern" : ""}
                    onChange={(e) => setRole(u.id, e.target.value)}
                  >
                    {Object.entries(ROLES).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
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

export default function Admin() {
  return (
    <RequireAuth roles={["admin"]}>
      <Users />
    </RequireAuth>
  );
}
