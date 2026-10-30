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
import EventBar from "@/components/event/EventBar";
import { useAuth } from "@/lib/auth";
import { LiveProvider } from "@/lib/liveContext";
import { useEventData } from "@/lib/eventData";

type Tab = "overview" | "live" | "incidents" | "penalties" | "drivers" | "overlays" | "settings";

function EventView() {
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { event, drivers, incidents, penalties, error, loaded, reload } = useEventData(params.id);
  const isAdmin = profile?.role === "admin";
  const isStaff = isAdmin || profile?.role === "steward";
  const isTeam = isStaff || profile?.role === "broadcaster";
  const isCaptain = drivers.some((d) => d.is_captain && d.profile_id && d.profile_id === profile?.id);
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<string | null>(null);

  if (!loaded) return <div className="notice">Lade …</div>;
  if (!event) return <div className="notice">Event nicht gefunden. Du bist eventuell noch nicht beigetreten. {error}</div>;

  const isHint = (i: (typeof incidents)[number]) => i.source === "auto" && i.status === "open";
  const openCount = incidents.filter((i) => i.status !== "closed" && !isHint(i)).length;
  const hintCount = incidents.filter(isHint).length;
  const tabs: [Tab, string, number?][] = [
    ["overview", "Übersicht"],
    ...(isTeam ? ([["live", "Live"]] as [Tab, string][]) : []),
    ...(isTeam ? ([["incidents", "Vorfälle", isStaff ? openCount + hintCount : 0]] as [Tab, string, number][]) : []),
    ["penalties", "Strafen"],
    ...(isTeam || isCaptain ? ([["drivers", isTeam ? "Fahrer" : "Mein Team"]] as [Tab, string][]) : []),
    ...(isTeam ? ([["overlays", "Overlays"]] as [Tab, string][]) : []),
    ...(isAdmin ? ([["settings", "Einstellungen"]] as [Tab, string][]) : []),
  ];

  return (
    <LiveProvider room={isTeam ? event.room : ""}>
      <EventBar event={event} showLive={isTeam} />
      {error && <div className="err">{error}</div>}
      <div className="tabs">
        {tabs.map(([key, label, count]) => (
          <div key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
            {!!count && <span className="cnt" title={`${openCount} offen, ${hintCount} Auto-Hinweise`}>{count}</span>}
          </div>
        ))}
      </div>
      <div className="tabbody">
      {tab === "overview" && (
        <OverviewTab event={event} incidents={incidents} penalties={penalties} drivers={drivers} isStaff={isStaff} isAdmin={isAdmin} go={(t) => setTab(t as Tab)} />
      )}
      {tab === "live" && isTeam && (
        <LiveTab event={event} incidents={incidents} drivers={drivers} openIncident={(id) => { setSelected(id); setTab("incidents"); }} reload={reload} />
      )}
      {tab === "incidents" && isTeam && (
        <IncidentsTab event={event} incidents={incidents} drivers={drivers} penalties={penalties} isStaff={isStaff} selectedId={selected} setSelectedId={setSelected} reload={reload} />
      )}
      {tab === "penalties" && (
        <PenaltiesTab event={event} penalties={penalties} drivers={drivers} isStaff={isStaff} myIngameName={profile?.ingame_name ?? null} reload={reload} />
      )}
      {tab === "drivers" && (isTeam || isCaptain) && <DriversTab event={event} drivers={drivers} isStaff={isStaff} reload={reload} />}
      {tab === "overlays" && isTeam && <OverlaysTab event={event} />}
      {tab === "settings" && isAdmin && <SettingsTab event={event} onSaved={reload} />}
      </div>
    </LiveProvider>
  );
}

export default function EventPage() {
  return (
    <RequireAuth>
      <EventView />
    </RequireAuth>
  );
}
