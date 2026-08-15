import { contextBridge, ipcRenderer } from 'electron'

// the secure bridge the HUD uses to talk to the desktop shell
contextBridge.exposeInMainWorld('jarvis', {
  desktop: true,
  platform: process.platform,
  quit: () => ipcRenderer.invoke('jarvis:quit'),
  minimize: () => ipcRenderer.invoke('jarvis:minimize'),
  getAutolaunch: () => ipcRenderer.invoke('jarvis:autolaunch:get'),
  setAutolaunch: (on: boolean) => ipcRenderer.invoke('jarvis:autolaunch:set', on),
})
