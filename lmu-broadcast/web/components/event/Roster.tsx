"use client";

import { useMemo, useState } from "react";
import CarNo from "@/components/CarNo";
import type { EventDriver } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase";

/** Anmeldeliste: Teams als Zeilen, Klick klappt die einzelnen Fahrer auf. Fahrer ohne Team stehen einzeln. */
export default function Roster({ drivers, canRemove, reload }: { drivers: EventDriver[]; canRemove?: boolean; reload?: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; team: string | null; members: EventDriver[] }>();
    for (const d of drivers) {
      const key = d.team_id ?? (d.team ? `n:${d.team.toLowerCase()}` : `d:${d.id}`);
      const g = map.get(key) ?? { key, team: d.team ?? null, members: [] };
      g.members.push(d);
      map.set(key, g);
    }
    return [...map.values()]
      .map((g) => {
        const first = g.members.find((m) => m.car_number != null) ?? g.members[0];
        return { ...g, num: first.car_number, cls: g.members.find((m) => m.car_class)?.car_class ?? null, joined: g.members.filter((m) => m.profile_id).length };
      })
      .sort((a, b) => (a.cls ?? "~").localeCompare(b.cls ?? "~") || (a.num ?? 9999) - (b.num ?? 9999) || (a.team ?? a.members[0].ingame_name).localeCompare(b.team ?? b.members[0].ingame_name));
  }, [drivers]);

  function toggle(k: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }

  async function remove(id: string) {
    await getSupabase()?.from("event_drivers").delete().eq("id", id);
    reload?.();
  }

  if (drivers.length === 0) return <p className="muted" style={{ padding: "14px 18px", margin: 0 }}>Noch kein Fahrer angemeldet.</p>;

  return (
    <div className="roster">
      {groups.map((g) => {
        const single = !g.team && g.members.length === 1;
        const isOpen = open.has(g.key);
        const m0 = g.members[0];
        return (
          <div key={g.key} className={`rteam${isOpen ? " open" : ""}`}>
            <button type="button" className="rhead" onClick={() => toggle(g.key)} aria-expanded={isOpen}>
              <span className="rchev">{isOpen ? "▾" : "▸"}</span>
              <span className="rnum">{g.num != null ? <CarNo num={g.num} cls={g.cls} /> : "–"}</span>
              <span className="rname"><b>{single ? m0.ingame_name : g.team}</b>{!single && <span className="muted"> · {g.members.length} {g.members.length === 1 ? "Fahrer" : "Fahrer"}</span>}</span>
              <span className="rcls muted">{g.cls ?? "–"}</span>
              <span className="rst muted">{g.joined}/{g.members.length} angemeldet</span>
            </button>
            {isOpen && (
              <ul className="rmembers">
                {g.members.map((d) => (
                  <li key={d.id}>
                    <span><b>{d.ingame_name}</b>{d.is_captain ? <span className="muted"> · Kapitän</span> : null}</span>
                    <span className="row" style={{ gap: 10 }}>
                      {d.profile_id ? <span className="badge closed">angemeldet</span> : <span className="muted">noch nicht beigetreten</span>}
                      {canRemove && <button className="danger" onClick={() => remove(d.id)}>Entfernen</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
