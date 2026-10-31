"use client";

/**
 * Sprechfunk der Rennleitung (kostenlos, ohne eigenen Server).
 *
 * Aufbau: Sternform. Die Rennleitung ("Host") ist die Mitte, jeder Fahrer ("Listener") verbindet sich nur mit ihr.
 * Die Verbindung zwischen den Browsern ist WebRTC (Audio, Opus). Der Verbindungsaufbau laeuft ueber einen
 * Supabase-Realtime-Broadcast-Kanal pro Event. Es werden nur kleine JSON-Nachrichten verschickt, kein Audio.
 *
 * Nachrichten ("sig"): hello (Listener meldet sich, alle 8 s), rc-here (Host fragt nach), bye, offer, answer, ice,
 * talk (Host sagt, wer gerade angesprochen wird, damit der Fahrer "Rennleitung spricht" sieht).
 *
 * Hinweis: Jeder angemeldete Event-Teilnehmer kennt den Kanal. Durchsagen sind deshalb nicht kryptografisch
 * abgesichert (siehe README, Abschnitt Sprechfunk).
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type PeerMeta = { uid: string; name: string; role: string; team: string | null; cls: string | null; num: number | null };
type Kind = "hello" | "rc-here" | "bye" | "offer" | "answer" | "ice" | "talk";
type Sig = { kind: Kind; from: string; to?: string; meta?: PeerMeta; data?: unknown; on?: boolean; targets?: string[] };

const HELLO_MS = 8000;
const STALE_MS = 25000;

export function iceServers(): RTCIceServer[] {
  const list: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  if (url) {
    list.push({ urls: url.split(",").map((u) => u.trim()), username: process.env.NEXT_PUBLIC_TURN_USER, credential: process.env.NEXT_PUBLIC_TURN_PASS });
  }
  return list;
}

class Net {
  private channel: RealtimeChannel;
  constructor(private supabase: SupabaseClient, eventId: string, onSig: (s: Sig) => void, onStatus?: (ok: boolean) => void) {
    this.channel = supabase
      .channel(`voice-${eventId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "sig" }, (msg) => onSig(msg.payload as Sig))
      .subscribe((st) => onStatus?.(st === "SUBSCRIBED"));
  }
  send(s: Sig) {
    void this.channel.send({ type: "broadcast", event: "sig", payload: s });
  }
  close() {
    void this.supabase.removeChannel(this.channel);
  }
}

export type PeerInfo = { meta: PeerMeta; state: string; lastSeen: number };

/** Rennleitung: Mikrofon, Verbindung zu jedem Fahrer, gezielt sprechen. */
export class VoiceHost {
  private net: Net;
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private peers = new Map<string, { meta: PeerMeta; pc: RTCPeerConnection; sender: RTCRtpSender | null; lastSeen: number; pending: RTCIceCandidateInit[]; remoteSet: boolean }>();
  private timer: ReturnType<typeof setInterval>;
  private talking = false;
  ready = false;

  constructor(supabase: SupabaseClient, eventId: string, private me: PeerMeta, private onChange: () => void) {
    this.net = new Net(supabase, eventId, (s) => this.onSig(s), (ok) => {
      this.ready = ok;
      if (ok) this.net.send({ kind: "rc-here", from: this.me.uid });
      this.onChange();
    });
    this.timer = setInterval(() => this.prune(), 5000);
  }

  async startMic(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.track = this.stream.getAudioTracks()[0];
    for (const p of this.peers.values()) this.attach(p);
    this.net.send({ kind: "rc-here", from: this.me.uid });
    this.onChange();
  }

  get micOn() { return !!this.track; }
  get isTalking() { return this.talking; }

  list(): PeerInfo[] {
    return [...this.peers.values()].map((p) => ({ meta: p.meta, state: p.pc.connectionState, lastSeen: p.lastSeen }));
  }

  /** Nur Fahrer, auf die `match` zutrifft, hoeren die Durchsage. null = Sprechtaste losgelassen. */
  talk(match: ((m: PeerMeta) => boolean) | null) {
    const targets: string[] = [];
    for (const [uid, p] of this.peers) {
      const on = !!match && match(p.meta) && !!this.track;
      if (on) targets.push(uid);
      void p.sender?.replaceTrack(on ? this.track : null).catch(() => {});
    }
    this.talking = !!match && targets.length > 0;
    this.net.send({ kind: "talk", from: this.me.uid, on: this.talking, targets });
    this.onChange();
    return targets.length;
  }

  private attach(p: { pc: RTCPeerConnection; sender: RTCRtpSender | null }) {
    if (!this.stream || !this.track || p.sender) return;
    p.sender = p.pc.addTrack(this.track, this.stream);
    void p.sender.replaceTrack(null).catch(() => {});
  }

  private async connect(meta: PeerMeta) {
    const old = this.peers.get(meta.uid);
    if (old) old.pc.close();
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const entry = { meta, pc, sender: null as RTCRtpSender | null, lastSeen: Date.now(), pending: [] as RTCIceCandidateInit[], remoteSet: false };
    this.peers.set(meta.uid, entry);
    if (this.track) this.attach(entry);
    else pc.addTransceiver("audio", { direction: "sendonly" });
    pc.onicecandidate = (e) => { if (e.candidate) this.net.send({ kind: "ice", from: this.me.uid, to: meta.uid, data: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => this.onChange();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.net.send({ kind: "offer", from: this.me.uid, to: meta.uid, data: { type: offer.type, sdp: offer.sdp } });
    this.onChange();
  }

  private onSig(s: Sig) {
    if (s.to && s.to !== this.me.uid) return;
    if (s.kind === "hello" && s.meta) {
      const p = this.peers.get(s.from);
      if (p) {
        p.lastSeen = Date.now();
        p.meta = s.meta;
        if (p.pc.connectionState === "failed" || p.pc.connectionState === "closed") void this.connect(s.meta);
      } else {
        void this.connect(s.meta);
      }
      this.onChange();
    } else if (s.kind === "answer") {
      const p = this.peers.get(s.from);
      if (!p) return;
      void p.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit).then(async () => {
        p.remoteSet = true;
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      });
    } else if (s.kind === "ice") {
      const p = this.peers.get(s.from);
      if (!p) return;
      if (p.remoteSet) void p.pc.addIceCandidate(s.data as RTCIceCandidateInit).catch(() => {});
      else p.pending.push(s.data as RTCIceCandidateInit);
    } else if (s.kind === "bye") {
      const p = this.peers.get(s.from);
      if (p) { p.pc.close(); this.peers.delete(s.from); this.onChange(); }
    }
  }

  private prune() {
    const now = Date.now();
    let changed = false;
    for (const [uid, p] of this.peers) {
      if (now - p.lastSeen > STALE_MS) { p.pc.close(); this.peers.delete(uid); changed = true; }
    }
    if (changed) this.onChange();
  }

  stop() {
    clearInterval(this.timer);
    this.talk(null);
    for (const p of this.peers.values()) p.pc.close();
    this.peers.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.net.close();
  }
}

export type ListenerState = { connected: boolean; talkingToMe: boolean; receiving: boolean };

/** Fahrer: meldet sich an, spielt die Durchsagen der Rennleitung ab. */
export class VoiceListener {
  private net: Net;
  private pcs = new Map<string, { pc: RTCPeerConnection; audio: HTMLAudioElement; pending: RTCIceCandidateInit[]; remoteSet: boolean }>();
  private timer: ReturnType<typeof setInterval>;
  private state: ListenerState = { connected: false, talkingToMe: false, receiving: false };
  private volume = 1;

  constructor(supabase: SupabaseClient, eventId: string, private me: PeerMeta, private onChange: (s: ListenerState) => void) {
    this.net = new Net(supabase, eventId, (s) => this.onSig(s), (ok) => {
      if (ok) this.hello();
    });
    this.timer = setInterval(() => this.hello(), HELLO_MS);
  }

  private set(p: Partial<ListenerState>) {
    this.state = { ...this.state, ...p };
    this.onChange(this.state);
  }

  private hello() {
    this.net.send({ kind: "hello", from: this.me.uid, meta: this.me });
  }

  setVolume(v: number) {
    this.volume = v;
    for (const p of this.pcs.values()) p.audio.volume = v;
  }

  private onSig(s: Sig) {
    if (s.to && s.to !== this.me.uid) return;
    if (s.kind === "rc-here") {
      this.hello();
    } else if (s.kind === "offer") {
      void this.answer(s.from, s.data as RTCSessionDescriptionInit);
    } else if (s.kind === "ice") {
      const p = this.pcs.get(s.from);
      if (!p) return;
      if (p.remoteSet) void p.pc.addIceCandidate(s.data as RTCIceCandidateInit).catch(() => {});
      else p.pending.push(s.data as RTCIceCandidateInit);
    } else if (s.kind === "talk") {
      this.set({ talkingToMe: !!s.on && !!s.targets?.includes(this.me.uid) });
    }
  }

  private async answer(from: string, offer: RTCSessionDescriptionInit) {
    this.pcs.get(from)?.pc.close();
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const audio = new Audio();
    audio.autoplay = true;
    audio.volume = this.volume;
    const entry = { pc, audio, pending: [] as RTCIceCandidateInit[], remoteSet: false };
    this.pcs.set(from, entry);
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void audio.play().catch(() => {});
      this.set({ receiving: true });
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.net.send({ kind: "ice", from: this.me.uid, to: from, data: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => this.set({ connected: [...this.pcs.values()].some((p) => p.pc.connectionState === "connected") });
    await pc.setRemoteDescription(offer);
    entry.remoteSet = true;
    for (const c of entry.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    this.net.send({ kind: "answer", from: this.me.uid, to: from, data: { type: ans.type, sdp: ans.sdp } });
  }

  leave() {
    clearInterval(this.timer);
    this.net.send({ kind: "bye", from: this.me.uid });
    for (const p of this.pcs.values()) { p.pc.close(); p.audio.srcObject = null; }
    this.pcs.clear();
    setTimeout(() => this.net.close(), 200);
  }
}
