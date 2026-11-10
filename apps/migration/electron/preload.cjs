const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("migrationAPI", {
  request: (command, args = {}) =>
    ipcRenderer.invoke("migration:request", command, args),
  pick: (id, kind) => ipcRenderer.invoke("migration:pick", id, kind),
  reveal: (id) => ipcRenderer.invoke("migration:reveal", id),
});
