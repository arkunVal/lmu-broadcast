"use client";

import { useCallback, useEffect, useState } from "react";

export type Cam = { name: string; key: string };   // name = Kameraname im Spiel, key = Hotkey wie "Ctrl+F1" (leer = keiner)

const NAMES = ["Cockpit", "Bonnet", "Splitter", "Chase", "TV", "Hood", "Dash Far", "Hood Right", "Hood Left", "F. Splitter", "R. Splitter", "Rearwing", "Rearwing Far"];
export const DEFAULT_CAMS: Cam[] = NAMES.map((name, i) => ({ name, key: `Ctrl+F${i + 1}` }));
const KEY = "flm-cambar";

/** Tastendruck als Text: "Ctrl+Shift+F1", "F5", "7". Nur die Taste allein (Strg, Umschalt ...) zaehlt nicht. */
export function comboOf(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): string {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return "";
  let k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (e.code.startsWith("Numpad") && e.code !== "NumpadEnter") k = `Num${e.code.slice(6)}`;
  if (k === " ") k = "Space";
  return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta", k].filter(Boolean).join("+");
}

/** Kameraleiste: Liste und Hotkeys liegen im Browser dieses Rechners (localStorage). */
export function useCameraBar() {
  const [cams, setCams] = useState<Cam[]>(DEFAULT_CAMS);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (Array.isArray(v) && v.every((c) => c && typeof c.name === "string" && typeof c.key === "string")) setCams(v.slice(0, 24));
    } catch {}
  }, []);
  const save = useCallback((next: Cam[]) => {
    setCams(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);
  return { cams, save, reset: () => save(DEFAULT_CAMS) };
}
