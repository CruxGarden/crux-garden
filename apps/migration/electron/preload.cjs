const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("migrationAPI", {
  request: (command, args = {}) =>
    ipcRenderer.invoke("migration:request", command, args),
  pick: (id, kind, context) =>
    ipcRenderer.invoke("migration:pick", id, kind, context),
  reveal: (id) => ipcRenderer.invoke("migration:reveal", id),
});
