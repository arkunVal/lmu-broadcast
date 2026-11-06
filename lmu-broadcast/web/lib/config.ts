/** Adresse der Server-Funktion (Supabase Edge Function "api"). Ersetzt die frueheren /api-Routen der Website. */
export const FUNCTIONS_URL = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1`;
export const apiUrl = (path: string) => `${FUNCTIONS_URL}/api${path}`;
/** Feste Adresse der lokalen App. Der Port ist fest, damit Login (Redirect) und gespeicherte Sitzung immer gleich bleiben. */
export const APP_PORT = 47821;
