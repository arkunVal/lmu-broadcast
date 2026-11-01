"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth";
import type { EventDriver, EventRow } from "./labels";
import { getSupabase } from "./supabase";
import { VoiceHost, VoiceListener, type InboxItem, type InterviewState, type ListenerState, type PeerInfo, type PeerMeta, type Scope, type Who } from "./voice";

type Ctx = {
  mode: "host" | "listener" | null;   // host = Rennleitung (spricht), listener = Fahrer (hört)
  active: boolean;
  error: string;
  join: () => Promise<void>;
  leave: () => void;
  peers: PeerInfo[];
  micOn: boolean;
  talking: boolean;
  talk: (match: ((m: PeerMeta) => boolean) | null, scope?: Scope) => number;
  message: (text: string, match: (m: PeerMeta) => boolean) => number;
  listener: ListenerState;
  setVolume: (v: number) => void;
  volume: number;
  chime: boolean;
  setChime: (on: boolean) => void;
  beep: () => void;
  myName: string;
  staff: boolean;                       // admin/steward: darf sprechen und Interviews starten
  inbox: InboxItem[];                   // Nachrichten der Fahrer an die Rennleitung
  dismissInbox: (id: string) => void;
  invite: (match: (m: PeerMeta) => boolean, topic: string, who: Who) => number;
  endInterview: () => void;
  interview: InterviewState | null;
  sendToRC: (text: string) => string | null;
  acceptInvite: () => Promise<void>;
  declineInvite: () => void;
};

const none: Ctx = {
  mode: null, active: false, error: "", join: async () => {}, leave: () => {}, peers: [], micOn: false, talking: false,
  talk: () => 0, message: () => 0, listener: { connected: false, talkingToMe: false, receiving: false, scope: null, hostOnline: false, invite: null, interview: false, acked: null }, staff: false, myName: "", inbox: [], dismissInbox: () => {}, invite: () => 0, endInterview: () => {}, interview: null, sendToRC: () => null, acceptInvite: async () => {}, declineInvite: () => {}, setVolume: () => {}, volume: 1, chime: true, setChime: () => {}, beep: () => {},
};
const VoiceCtx = createContext<Ctx>(none);
export const useVoice = () => useContext(VoiceCtx);

/** Hält die Sprechfunk-Verbindung, solange man im Event ist (auch beim Wechsel der Tabs). */
export function VoiceProvider({ event, drivers, children }: { event: EventRow; drivers: EventDriver[]; children: React.ReactNode }) {
  const { profile } = useAuth();
  const staff = profile?.role === "admin" || profile?.role === "steward";
  const mode: Ctx["mode"] = staff || profile?.role === "broadcaster" ? "host" : profile?.role === "driver" ? "listener" : null;
  const host = useRef<VoiceHost | null>(null);
  const lis = useRef<VoiceListener | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [, bump] = useState(0);
  const [listener, setListener] = useState<ListenerState>(none.listener);
  const [volume, setVol] = useState(1);
  const [chime, setChimeState] = useState(true);
  useEffect(() => { try { setChimeState(localStorage.getItem("flm-chime") !== "0"); } catch {} }, []);
  const beep = useCallback(() => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      // Zwei weiche Toene (E5, B5), wie ein Bordsignal: kurz, leise, ohne scharfen Anschlag
      [[659.25, 0], [987.77, 0.16]].forEach(([f, t]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.4);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.45);
      });
      setTimeout(() => void ctx.close(), 900);
    } catch {}
  }, []);
  const invId = listener.invite?.id;
  useEffect(() => { if (invId) beep(); }, [invId]); // eslint-disable-line react-hooks/exhaustive-deps
  const inboxN = host.current?.inbox.length ?? 0;
  const lastInbox = useRef(0);
  useEffect(() => { if (inboxN > lastInbox.current && chime) beep(); lastInbox.current = inboxN; }); // eslint-disable-line react-hooks/exhaustive-deps
  const talkingToMe = listener.talkingToMe;
  useEffect(() => { if (talkingToMe && chime) beep(); }, [talkingToMe]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = useMemo<PeerMeta | null>(() => {
    if (!profile) return null;
    const d = drivers.find((x) => x.profile_id === profile.id) ?? drivers.find((x) => profile.ingame_name && x.ingame_name.toLowerCase() === profile.ingame_name.toLowerCase());
    return {
      uid: profile.id,
      name: d?.ingame_name ?? profile.ingame_name ?? profile.display_name,
      role: profile.role ?? "",
      team: d?.team ?? null,
      cls: d?.car_class ?? null,
      num: d?.car_number ?? null,
    };
  }, [profile, drivers]);

  const leave = useCallback(() => {
    host.current?.stop();
    lis.current?.leave();
    host.current = null;
    lis.current = null;
    setActive(false);
    setListener(none.listener);
  }, []);

  const join = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !me || !mode || active) return;
    setError("");
    try {
      if (mode === "host") {
        const h = new VoiceHost(supabase, event.id, me, () => bump((n) => n + 1));
        host.current = h;
        if (staff) await h.startMic();   // Broadcaster hoert nur mit (Posteingang), ohne Mikrofon
      } else {
        lis.current = new VoiceListener(supabase, event.id, me, setListener);
        lis.current.setVolume(volume);
      }
      setActive(true);
    } catch (e) {
      host.current?.stop();
      host.current = null;
      setError(e instanceof Error && e.name === "NotAllowedError" ? "Mikrofon wurde nicht erlaubt. Im Browser freigeben und erneut versuchen." : e instanceof Error && e.name === "NotFoundError" ? "Kein Mikrofon gefunden." : `Sprechfunk-Fehler: ${e instanceof Error ? e.message : e}`);
    }
  }, [me, mode, staff, active, event.id, volume]);

  useEffect(() => () => leave(), [leave]);
  useEffect(() => {
    const h = () => { host.current?.stop(); lis.current?.leave(); };
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, []);

  const value: Ctx = {
    mode, active, error, join, leave,
    peers: host.current?.list() ?? [],
    micOn: host.current?.micOn ?? false,
    talking: host.current?.isTalking ?? false,
    talk: (m, sc) => host.current?.talk(m, sc) ?? 0,
    message: (t, m) => host.current?.message(t, m) ?? 0,
    listener,
    setVolume: (v) => { setVol(v); lis.current?.setVolume(v); },
    volume, chime, beep, staff, myName: me?.name ?? "",
    inbox: host.current?.inbox ?? [],
    dismissInbox: (id) => host.current?.dismiss(id),
    invite: (m, t, w) => host.current?.invite(m, t, w) ?? 0,
    endInterview: () => host.current?.endInterview(),
    interview: host.current?.interview ?? null,
    sendToRC: (t) => lis.current?.sendToRC(t) ?? null,
    acceptInvite: async () => { try { await lis.current?.acceptInvite(); } catch (e) { setError(e instanceof Error && e.name === "NotAllowedError" ? "Mikrofon wurde nicht erlaubt." : "Mikrofon nicht verfügbar."); lis.current?.declineInvite(); } },
    declineInvite: () => lis.current?.declineInvite(),
    setChime: (on) => { setChimeState(on); try { localStorage.setItem("flm-chime", on ? "1" : "0"); } catch {} },
  };
  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}
