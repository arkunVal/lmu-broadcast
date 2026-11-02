"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { createPortal } from "react-dom";
import AccountTab from "@/components/event/AccountTab";
import ControlsTab from "@/components/event/ControlsTab";
import FunkTab from "@/components/event/FunkTab";
import EventBar from "@/components/event/EventBar";
import IncidentsTab from "@/components/event/IncidentsTab";
import BroadcastTab from "@/components/event/BroadcastTab";
import MapTab from "@/components/event/MapTab";
import PenaltiesTab from "@/components/event/PenaltiesTab";
import SessionTab from "@/components/event/SessionTab";
import { useAuth } from "@/lib/auth";
import { useEventData } from "@/lib/eventData";
import { groupHints, isHint } from "@/lib/hints";
import { LiveProvider } from "@/lib/liveContext";
import { VoiceProvider, useVoice } from "@/lib/voiceContext";

type Tab = "live" | "controls" | "map" | "incidents" | "penalties" | "session" | "voice" | "account";

function FunkDot() {
  const v = useVoice();
  return v.listener.talkingToMe ? <span className="cnt live" title="Rennleitung spricht">●</span> : null;
}

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
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById("side-event")); });

  if (!loaded) return <div className="notice">Lade …</div>;
  if (!event) return <div className="notice">Event nicht gefunden. Du bist eventuell noch nicht beigetreten. {error}</div>;

  const openCount = incidents.filter((i) => i.status !== "closed" && !isHint(i)).length;
  const hintCount = groupHints(incidents.filter(isHint)).length;
  const tabs: [Tab, string, number?][] = [
    ...(isTeam ? ([["live", "Broadcast"], ["controls", "Controls"], ["map", "Track Map"], ["incidents", "Replay", isStaff ? openCount + hintCount : 0]] as [Tab, string, number?][]) : []),
    ["penalties", "Penalties"],
    ["session", "Session"],
    ...(profile?.role === "driver" ? ([["voice", "Funk"]] as [Tab, string][]) : []),
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
        {slot && createPortal(
          <nav aria-label="Event-Menü" role="tablist">
            {(isTeam ? [["Rennleitung", tabs.filter(([k]) => ["live", "controls", "map", "incidents"].includes(k))]] : []).concat([["Event", tabs.filter(([k]) => !["live", "controls", "map", "incidents"].includes(k))]] as never[]).map(([group, items]) => (
              <div key={group as string}>
                <div className="sidelabel">{group as string}</div>
                {(items as [Tab, string, number?][]).map(([key, label, count]) => (
                  <button key={key} role="tab" aria-selected={current === key} className={`navlink tab${current === key ? " on active" : ""}`} onClick={() => setTab(key)}>
                    <span className="dot" />
                    <span>{label}</span>
                    {key === "voice" && <FunkDot />}
                    {!!count && <span className="cnt" title={`${openCount} offen, ${hintCount} Auto-Hinweise`}>{count}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>,
          slot,
        )}
        <div className="tabbody">
          {current === "live" && isTeam && <BroadcastTab event={event} drivers={drivers} incidents={incidents} />}
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
          {current === "voice" && profile?.role === "driver" && <FunkTab />}
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
