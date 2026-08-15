import { contextBridge, ipcRenderer } from 'electron'

// the secure bridge the HUD uses to talk to the desktop shell
contextBridge.exposeInMainWorld('jarvis', {
  desktop: true,
  platform: process.platform,
  quit: () => ipcRenderer.invoke('jarvis:quit'),
  minimize: () => ipcRenderer.invoke('jarvis:minimize'),
  getAutolaunch: () => ipcRenderer.invoke('jarvis:autolaunch:get'),
  setAutolaunch: (on: boolean) => ipcRenderer.invoke('jarvis:autolaunch:set', on),
  typeText: (text: string) => ipcRenderer.invoke('jarvis:os:type', text),
  openApp: (name: string) => ipcRenderer.invoke('jarvis:os:open-app', name),
  openUrl: (url: string) => ipcRenderer.invoke('jarvis:os:open-url', url),
  systemControl: (action: string) => ipcRenderer.invoke('jarvis:os:system', action),
})
