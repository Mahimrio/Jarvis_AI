let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("jarvis", {
	desktop: true,
	platform: process.platform,
	quit: () => electron.ipcRenderer.invoke("jarvis:quit"),
	minimize: () => electron.ipcRenderer.invoke("jarvis:minimize")
});
//#endregion
