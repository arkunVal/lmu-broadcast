// Lokaler Mini-Webserver: liefert die Website (Ordner "web") nur an diesen Rechner (127.0.0.1) aus.
// Die App und die OBS-Overlays nutzen dieselbe Adresse: http://127.0.0.1:47821
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 47821;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8", ".map": "application/json", ".webmanifest": "application/manifest+json",
};

// Schutz gegen Skript-Einschleusung. Supabase (Daten, Login, Live) und Google Fonts sind erlaubt, sonst nur lokal.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function resolveFile(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split("?")[0]); } catch { return null; }
  const full = path.normalize(path.join(root, p));
  if (!full.startsWith(root)) return null;   // kein Ausbrechen aus dem Ordner
  const tries = [full, full + ".html", path.join(full, "index.html")];
  for (const t of tries) { try { if (fs.statSync(t).isFile()) return t; } catch {} }
  return null;
}

function startServer(root) {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    let file = resolveFile(root, req.url || "/");
    let status = 200;
    if (!file) { file = path.join(root, "404.html"); status = 404; }
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    const isHtml = type.startsWith("text/html");
    const headers = {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": isHtml || file.includes(`${path.sep}overlay`) ? "no-store" : "public, max-age=3600",
    };
    if (isHtml) headers["Content-Security-Policy"] = CSP;
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(500); return res.end("Fehler"); }
      res.writeHead(status, headers);
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

module.exports = { startServer, PORT, resolveFile };
