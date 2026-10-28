import type { EventRow } from "./labels";

const LEAD_S = 8; // so viele Sekunden vor dem Vorfall anspringen, damit man die Entstehung sieht

/**
 * Zeit, die man im Replay von Le Mans Ultimate anspringt.
 * Der Reader liest die Session-Uhr des Spiels (mCurrentET) im Moment des Vorfalls. Das Spiel-Replay
 * nutzt dieselbe Uhr. replay_offset korrigiert eine feste Abweichung (Sekunden), falls die Uhr im Replay anders laeuft.
 */
export function replayStamp(event: Pick<EventRow, "replay_offset">, sessionTime: number | null | undefined): number | null {
  if (sessionTime == null) return null;
  return Math.max(0, Math.floor(sessionTime + (event.replay_offset ?? 0) - LEAD_S));
}
