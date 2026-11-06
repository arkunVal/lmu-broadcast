// Bruecke zwischen Website und App. Die Website bekommt nur diese wenigen Funktionen, keinen Zugriff auf Node.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("flmDesktop", {
  version: ipcRenderer.sendSync("app:version"),
  readerStatus: () => ipcRenderer.invoke("reader:status"),
  readerStart: (key) => ipcRenderer.invoke("reader:start", String(key || "")),
  readerStop: () => ipcRenderer.invoke("reader:stop"),
  onReaderLog: (cb) => {
    const f = (_e, s) => cb(s);
    ipcRenderer.on("reader:state", f);
    return () => ipcRenderer.removeListener("reader:state", f);
  },
});
