"use client";

import { useSyncExternalStore } from "react";

// Merkt, welche Stelle (Session-Zeit) zuletzt im Spiel-Replay angesprungen wurde. Zeilen heben sich damit hervor.
let current: number | null = null;
const subs = new Set<() => void>();

export function setLooked(t: number | null | undefined) {
  current = t ?? null;
  subs.forEach((f) => f());
}

export function useLooked(t: number | null | undefined): boolean {
  const cur = useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => current,
    () => null,
  );
  return t != null && cur === t;
}

import { createElement, type ReactNode, type CSSProperties } from "react";

/** Zeile/Kasten, der sich hervorhebt, wenn seine Stelle zuletzt im Replay angesprungen wurde. */
export function Looked({ as = "div", t, className = "", style, onClick, children }: { as?: "div" | "tr"; t: number | null | undefined; className?: string; style?: CSSProperties; onClick?: () => void; children: ReactNode }) {
  const on = useLooked(t);
  return createElement(as, { className: `${className}${on ? " looked" : ""}`.trim(), style, onClick }, children);
}
