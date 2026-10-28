"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import DriversTab from "@/components/event/DriversTab";
import IncidentsTab from "@/components/event/IncidentsTab";
import LiveTab from "@/components/event/LiveTab";
import OverlaysTab from "@/components/event/OverlaysTab";
import OverviewTab from "@/components/event/OverviewTab";
import PenaltiesTab from "@/components/event/PenaltiesTab";
import SettingsTab from "@/components/event/SettingsTab";
import { useAuth } from "@/lib/auth";
import { useEventData } from "@/lib/eventData";

type Tab = "overview" | "live" | "incidents" | "penalties" | "drivers" | "overlays" | "settings";
const STATUS: Record<string, string> = { planned: "Geplant", live: "Live", finished: "Beendet" };

function EventView() {
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { event, drivers, incidents, penalties, error, loaded, reload } = useEventData(params.id);
  const isAdmin = profile?.role === "admin";
  const isStaff = isAdmin || profile?.role === "steward";
  const isTeam = isStaff || profile?.role === "broadcaster";
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<string | null>(null);

  if (!loaded) return <div className="notice">Lade …</div>;
  if (!event) return <div className="notice">Event nicht gefunden. Du bist eventuell noch nicht beigetreten. {error}</div>;

  const openCount = incidents.filter((i) => i.status !== "closed").length;
  const tabs: [Tab, string][] = [
    ["overview", "Übersicht"],
    ...(isTeam ? ([["live", "Live"]] as [Tab, string][]) : []),
    ["incidents", `Vorfälle${isStaff && openCount ? ` (${openCount})` : ""}`],
    ["penalties", "Strafen"],
    ["drivers", "Fahrer"],
    ...(isTeam ? ([["overlays", "Overlays"]] as [Tab, string][]) : []),
    ...(isAdmin ? ([["settings", "Einstellungen"]] as [Tab, string][]) : []),
  ];

  return (
    <>
      <div className="page-title">
        <div>
          <h1>{event.name}</h1>
          <p>{event.track ?? "Strecke noch offen"}</p>
        </div>
        <span className={`badge ${event.status === "live" ? "live" : ""}`}>{STATUS[event.status]}</span>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="tabs">
        {tabs.map(([key, label]) => (
          <div key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</div>
        ))}
      </div>
      {tab === "overview" && (
        <OverviewTab event={event} incidents={incidents} penalties={penalties} drivers={drivers} isStaff={isStaff} isAdmin={isAdmin} go={(t) => setTab(t as Tab)} />
      )}
      {tab === "live" && isTeam && (
        <LiveTab event={event} incidents={incidents} openIncident={(id) => { setSelected(id); setTab("incidents"); }} />
      )}
      {tab === "incidents" && (
        <IncidentsTab event={event} incidents={incidents} drivers={drivers} penalties={penalties} isStaff={isStaff} selectedId={selected} setSelectedId={setSelected} reload={reload} />
      )}
      {tab === "penalties" && (
        <PenaltiesTab event={event} penalties={penalties} drivers={drivers} isStaff={isStaff} myIngameName={profile?.ingame_name ?? null} reload={reload} />
      )}
      {tab === "drivers" && <DriversTab event={event} drivers={drivers} isStaff={isStaff} reload={reload} />}
      {tab === "overlays" && isTeam && <OverlaysTab event={event} />}
      {tab === "settings" && isAdmin && <SettingsTab event={event} onSaved={reload} />}
    </>
  );
}

export default function EventPage() {
  return (
    <RequireAuth>
      <EventView />
    </RequireAuth>
  );
}
