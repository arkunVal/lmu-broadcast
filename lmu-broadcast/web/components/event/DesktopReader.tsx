"use client";

import { useEffect, useRef, useState } from "react";
import { desktop, type ReaderState } from "@/lib/desktop";

/** Nur in der Desktop-App: startet und stoppt den Reader direkt hier, ohne Fenster und ohne Key einfügen. */
export default function DesktopReader({ readerKey }: { readerKey: string }) {
  const [d, setD] = useState<ReturnType<typeof desktop>>(null);
  const [st, setSt] = useState<ReaderState>({ running: false, log: [] });
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const api = desktop();
    setD(api);
    if (!api) return;
    void api.readerStatus().then(setSt);
    return api.onReaderLog(setSt);
  }, []);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [st.log.length]);

  if (!d) return null;
  const act = async (fn: () => Promise<ReaderState>) => { setBusy(true); try { setSt(await fn()); } finally { setBusy(false); } };
  return (
    <div className="panel wide">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Reader in der App</h3>
        <span className={st.running ? "okmsg" : "muted"}>{st.running ? "● läuft" : "○ gestoppt"}</span>
      </div>
      <p className="muted" style={{ margin: "2px 0 10px" }}>
        Für den Rennrechner: Startet den Reader mit dem Key dieses Events. Das Spiel muss laufen, damit Daten kommen. Beim Event-Wechsel erst stoppen, dann neu starten.
      </p>
      <div className="row">
        <button className="primary" disabled={busy || st.running || !readerKey} onClick={() => act(() => d.readerStart(readerKey))}>Reader starten</button>
        <button disabled={busy || !st.running} onClick={() => act(() => d.readerStop())}>Stoppen</button>
        <span className="muted" style={{ fontSize: 12 }}>App v{d.version}</span>
      </div>
      {st.error && <p className="err">{st.error}</p>}
      {st.log.length > 0 && <pre ref={box} style={{ maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12 }}>{st.log.join("\n")}</pre>}
    </div>
  );
}
