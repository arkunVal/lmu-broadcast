"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import AccountTab from "@/components/event/AccountTab";
import ControlsTab from "@/components/event/ControlsTab";
import EventBar from "@/components/event/EventBar";
import IncidentsTab from "@/components/event/IncidentsTab";
import LiveTab from "@/components/event/LiveTab";
import MapTab from "@/components/event/MapTab";
import PenaltiesTab from "@/components/event/PenaltiesTab";
import SessionTab from "@/components/event/SessionTab";
import { useAuth } from "@/lib/auth";
import { useEventData } from "@/lib/eventData";
import { groupHints, isHint } from "@/lib/hints";
import { LiveProvider } from "@/lib/liveContext";
import { VoiceProvider } from "@/lib/voiceContext";

type Tab = "live" | "controls" | "map" | "incidents" | "penalties" | "session" | "account";

function EventView() {
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { event, drivers, incidents, penalties, error, loaded, reload } = useEventData(params.id);
  const isAdmin = profile?.role === "admin";
  const isStaff = isAdmin || profile?.role === "steward";
  const isTeam = isStaff || profile?.role === "broadcaster";
  const isCaptain = drivers.some((d) => d.is_captain && d.profile_id && d.profile_id === profile?.id);
  const [tab, setTab] = useState<Tab | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  if (!loaded) return <div className="notice">Lade …</div>;
  if (!event) return <div className="notice">Event nicht gefunden. Du bist eventuell noch nicht beigetreten. {error}</div>;

  const openCount = incidents.filter((i) => i.status !== "closed" && !isHint(i)).length;
  const hintCount = groupHints(incidents.filter(isHint)).length;
  const tabs: [Tab, string, number?][] = [
    ...(isTeam ? ([["live", "Live Timings"], ["controls", "Controls"], ["map", "Track Map"], ["incidents", "Replay", isStaff ? openCount + hintCount : 0]] as [Tab, string, number?][]) : []),
    ["penalties", "Penalties"],
    ["session", "Session"],
    ["account", "Account"],
  ];
  const current: Tab = tab && tabs.some(([k]) => k === tab) ? tab : isTeam ? "live" : "session";
  const openIncident = (id: string) => { setSelected(id); setTab("incidents"); };
  const goTab = (t: string) => setTab((t === "drivers" ? "session" : t) as Tab);

  return (
    <LiveProvider room={isTeam ? event.room : ""}>
      <VoiceProvider event={event} drivers={drivers}>
        <EventBar event={event} showLive={isTeam} />
        {error && <div className="err">{error}</div>}
        <div className="tabs navtabs" role="tablist">
          {tabs.map(([key, label, count]) => (
            <button key={key} role="tab" aria-selected={current === key} className={`tab ${current === key ? "active" : ""}`} onClick={() => setTab(key)}>
              {label}
              {!!count && <span className="cnt" title={`${openCount} offen, ${hintCount} Auto-Hinweise`}>{count}</span>}
            </button>
          ))}
        </div>
        <div className="tabbody">
          {current === "live" && isTeam && <LiveTab event={event} drivers={drivers} />}
          {current === "controls" && isTeam && <ControlsTab event={event} />}
          {current === "map" && isTeam && <MapTab />}
          {current === "incidents" && isTeam && (
            <IncidentsTab event={event} incidents={incidents} drivers={drivers} penalties={penalties} isStaff={isStaff} selectedId={selected} setSelectedId={setSelected} reload={reload} />
          )}
          {current === "penalties" && (
            <PenaltiesTab event={event} penalties={penalties} drivers={drivers} incidents={incidents} isStaff={isStaff} myIngameName={profile?.ingame_name ?? null} openIncident={openIncident} reload={reload} />
          )}
          {current === "session" && (
            <SessionTab event={event} incidents={incidents} penalties={penalties} drivers={drivers} isStaff={isStaff} isAdmin={isAdmin} canManageDrivers={isTeam || isCaptain} go={goTab} reload={reload} />
          )}
          {current === "account" && <AccountTab />}
        </div>
      </VoiceProvider>
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
