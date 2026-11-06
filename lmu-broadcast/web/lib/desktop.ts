/** Schnittstelle der Desktop-App (desktop/preload.js). In der normalen Webseite gibt es sie nicht. */
export type ReaderState = { running: boolean; log: string[]; error?: string };
export type FlmDesktop = {
  version: string;
  readerStatus: () => Promise<ReaderState>;
  readerStart: (key: string) => Promise<ReaderState>;
  readerStop: () => Promise<ReaderState>;
  onReaderLog: (cb: (s: ReaderState) => void) => () => void;
};
export const desktop = (): FlmDesktop | null => (typeof window !== "undefined" ? ((window as unknown as { flmDesktop?: FlmDesktop }).flmDesktop ?? null) : null);
