// Reader-Key: "LMU1." + base64url(JSON). Muss zu reader/reader_key.py passen.
export type ReaderKeyValues = {
  supabase_url: string;
  anon_key: string;
  room: string;
  site_url: string;
  ingest_token: string;
};

export function encodeReaderKey(v: ReaderKeyValues): string {
  const bytes = new TextEncoder().encode(JSON.stringify(v));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return "LMU1." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
