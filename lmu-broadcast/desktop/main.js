// FLM Broadcast Desktop: Fenster + lokaler Server + Reader-Steuerung.
const { app, BrowserWindow, ipcMain, shell, Menu } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { startServer, PORT } = require("./server");

const ORIGIN = `http://127.0.0.1:${PORT}`;
const packaged = app.isPackaged;
const webRoot = packaged ? path.join(process.resourcesPath, "web") : path.join(__dirname, "..", "web", "out");
const LOG_MAX = 200;
// Login (Discord/E-Mail) laeuft ueber diese Hosts im selben Fenster, alles andere oeffnet im normalen Browser.
const ALLOWED_NAV = [/^127\.0\.0\.1$/, /\.supabase\.co$/, /^discord\.com$/, /\.discord\.com$/];

let win = null;
let server = null;
const reader = { proc: null, log: [], error: "" };

const readerState = () => ({ running: !!reader.proc, log: reader.log, error: reader.error || undefined });
const pushState = () => { if (win && !win.isDestroyed()) win.webContents.send("reader:state", readerState()); };
function addLog(chunk) {
  for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) reader.log.push(line.slice(0, 400));
  if (reader.log.length > LOG_MAX) reader.log.splice(0, reader.log.length - LOG_MAX);
  pushState();
}

function readerCommand(configPath) {
  if (packaged) {
    const exe = path.join(process.resourcesPath, "reader", "FLM-Reader.exe");
    if (!fs.existsSync(exe)) return null;
    return { cmd: exe, args: ["--config", configPath], cwd: path.dirname(configPath) };
  }
  // Entwicklung: Python-Skript
  const script = path.join(__dirname, "..", "reader", "lmu_reader.py");
  return { cmd: process.platform === "win32" ? "py" : "python3", args: [script, "--config", configPath], cwd: path.dirname(script) };
}

function startReader(key) {
  if (reader.proc) return readerState();
  reader.error = "";
  if (!/^LMU1\.[A-Za-z0-9_-]+$/.test(key)) { reader.error = "Reader-Key ungueltig"; return readerState(); }
  const dir = path.join(app.getPath("userData"), "reader");
  fs.mkdirSync(dir, { recursive: true });
  const cfg = path.join(dir, "config.json");
  fs.writeFileSync(cfg, JSON.stringify({ reader_key: key }, null, 2), { mode: 0o600 });
  const rc = readerCommand(cfg);
  if (!rc) { reader.error = "FLM-Reader.exe fehlt in der Installation"; return readerState(); }
  reader.log = [];
  try {
    const p = spawn(rc.cmd, rc.args, { cwd: rc.cwd, windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" } });
    reader.proc = p;
    p.stdout.on("data", addLog);
    p.stderr.on("data", addLog);
    p.on("error", (e) => { reader.error = "Start fehlgeschlagen: " + e.message; reader.proc = null; pushState(); });
    p.on("exit", (code) => { addLog(`Reader beendet (Code ${code})`); reader.proc = null; pushState(); });
  } catch (e) {
    reader.error = "Start fehlgeschlagen: " + e.message;
  }
  return readerState();
}

function stopReader() {
  const p = reader.proc;
  if (p) {
    try { p.kill(); } catch {}
    reader.proc = null;
  }
  return readerState();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: "#0c0d11", title: "FLM Broadcast", autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const isLocal = (u) => { try { return new URL(u).origin === ORIGIN; } catch { return false; } };
  const allowed = (u) => { try { const x = new URL(u); return x.protocol === "https:" ? ALLOWED_NAV.some((r) => r.test(x.hostname)) : isLocal(u); } catch { return false; } };
  win.webContents.on("will-navigate", (e, u) => { if (!allowed(u)) { e.preventDefault(); if (/^https:/.test(u)) void shell.openExternal(u); } });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) return { action: "allow" };   // z. B. OBS-Overlay-Vorschau in neuem Fenster
    if (/^https:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  // Mikrofon nur fuer die eigene Seite (Funk)
  win.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(perm === "media" && isLocal(wc.getURL())));
  void win.loadURL(ORIGIN + "/");
  win.on("closed", () => { win = null; });
}

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  ipcMain.on("app:version", (e) => { e.returnValue = app.getVersion(); });
  ipcMain.handle("reader:status", () => readerState());
  ipcMain.handle("reader:start", (_e, key) => startReader(String(key)));
  ipcMain.handle("reader:stop", () => stopReader());
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      server = await startServer(webRoot);
    } catch (e) {
      const { dialog } = require("electron");
      dialog.showErrorBox("FLM Broadcast", `Port ${PORT} ist belegt oder der Server startet nicht.\nLaeuft die App schon? ${e.message}`);
      return app.quit();
    }
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => { stopReader(); if (server) server.close(); });
}
