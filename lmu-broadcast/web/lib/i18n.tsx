"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { EN, EN_PATTERNS } from "./i18n-en";

export type Lang = "de" | "en";
const KEY = "flm-lang";
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "de", setLang: () => {} });
export const useLang = () => useContext(Ctx);

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Deutscher Text -> Englisch (exakt, dann Muster mit {0}-Platzhaltern). Unbekanntes bleibt unveraendert. */
export function trEn(s: string): string {
  const k = norm(s);
  if (!k) return s;
  const hit = EN[k];
  if (hit !== undefined) return s.replace(k, hit).replace(/^\s+|\s+$/g, (m) => m);
  for (const [re, out] of EN_PATTERNS) {
    const m = k.match(re);
    if (m) return s.replace(k, out.replace(/\{(\d+)\}/g, (_, i) => { const c = m[+i + 1] ?? ""; return EN[norm(c)] ?? c; }));
  }
  return s;
}
export const tr = (lang: Lang, s: string) => (lang === "en" ? trEn(s) : s);

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
type Rec = { de: string; en: string };

/** Uebersetzt sichtbaren Text im ganzen Dokument und stellt das Deutsche wieder her. Eigene Eingaben (Namen) bleiben, weil sie nicht im Woerterbuch stehen. */
function useDomTranslate(lang: Lang) {
  useEffect(() => {
    if (location.pathname.startsWith("/overlay")) return;
    document.documentElement.lang = lang;
    const texts = new Map<Text, Rec>();
    const attrs = new Map<string, Rec>();   // key: id des Elements + Attribut
    const els = new Map<Element, Record<string, Rec>>();
    let busy = false;

    const skip = (n: Node) => {
      const p = n.parentElement;
      return !p || ["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT"].includes(p.tagName) || !!p.closest("[data-no-i18n]");
    };
    function text(n: Text) {
      if (skip(n)) return;
      const cur = n.nodeValue ?? "";
      const rec = texts.get(n);
      if (rec && cur === rec.en) return;
      if (lang === "de") { if (rec) texts.delete(n); return; }
      const en = trEn(cur);
      if (en !== cur) { texts.set(n, { de: cur, en }); n.nodeValue = en; } else texts.delete(n);
    }
    function el(e: Element) {
      for (const a of ATTRS) {
        const cur = e.getAttribute(a);
        if (cur == null) continue;
        const m = els.get(e)?.[a];
        if (m && cur === m.en) continue;
        if (lang === "de") continue;
        const en = trEn(cur);
        if (en !== cur) { const o = els.get(e) ?? {}; o[a] = { de: cur, en }; els.set(e, o); e.setAttribute(a, en); }
      }
    }
    function walk(root: Node) {
      if (root.nodeType === 3) { text(root as Text); return; }
      if (root.nodeType !== 1) return;
      el(root as Element);
      const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = w.nextNode())) n.nodeType === 3 ? text(n as Text) : el(n as Element);
    }
    function restore() {
      for (const [n, r] of texts) if (n.nodeValue === r.en) n.nodeValue = r.de;
      for (const [e, o] of els) for (const a in o) if (e.getAttribute(a) === o[a].en) e.setAttribute(a, o[a].de);
      texts.clear(); els.clear(); attrs.clear();
    }
    const run = (f: () => void) => { if (busy) return; busy = true; try { f(); } finally { busy = false; } };

    if (lang === "en") run(() => walk(document.body));
    const mo = new MutationObserver((recs) => {
      if (lang !== "en" || busy) return;
      run(() => {
        for (const r of recs) {
          if (r.type === "characterData") text(r.target as Text);
          else if (r.type === "attributes") el(r.target as Element);
          else r.addedNodes.forEach((n) => walk(n));
        }
      });
    });
    if (lang === "en") mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => { mo.disconnect(); run(restore); };
  }, [lang]);
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("de");
  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s === "en" || s === "de") setLangState(s);
      else if (navigator.language?.toLowerCase().startsWith("en")) setLangState("en");
    } catch {}
  }, []);
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch {} }, []);
  useDomTranslate(lang);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

/** Umschalter DE | EN (Login, Einstellungen). */
export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`langsw ${className}`} role="group" aria-label="Language / Sprache" data-no-i18n>
      {(["de", "en"] as const).map((l) => (
        <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>{l === "de" ? "Deutsch" : "English"}</button>
      ))}
    </div>
  );
}
