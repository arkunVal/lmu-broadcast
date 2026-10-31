"use client";

import type { EventDriver, EventRow, Incident, Penalty } from "@/lib/labels";
import DriversTab from "./DriversTab";
import OverviewTab from "./OverviewTab";
import SettingsTab from "./SettingsTab";

/** Event-Infos, Anmeldungen und (für Admins) Einstellungen. */
export default function SessionTab({
  event, incidents, penalties, drivers, isStaff, isAdmin, canManageDrivers, go, reload,
}: {
  event: EventRow; incidents: Incident[]; penalties: Penalty[]; drivers: EventDriver[];
  isStaff: boolean; isAdmin: boolean; canManageDrivers: boolean; go: (tab: string) => void; reload: () => void;
}) {
  return (
    <div className="scrollarea stack">
      <OverviewTab event={event} incidents={incidents} penalties={penalties} drivers={drivers} isStaff={isStaff} isAdmin={isAdmin} go={go} />
      {canManageDrivers && <DriversTab event={event} drivers={drivers} isStaff={isStaff} reload={reload} />}
      {isAdmin && <SettingsTab event={event} onSaved={reload} />}
    </div>
  );
}
