// typed access to the Electron bridge — everything degrades gracefully in a plain browser
export interface JarvisBridge {
  desktop: boolean
  platform: string
  quit: () => Promise<void>
  minimize: () => Promise<void>
  getAutolaunch: () => Promise<boolean>
  setAutolaunch: (on: boolean) => Promise<boolean>
  typeText: (text: string) => Promise<string>
  openApp: (name: string) => Promise<string>
  openUrl: (url: string) => Promise<string>
  systemControl: (action: string) => Promise<string>
}

declare global {
  interface Window {
    jarvis?: JarvisBridge
  }
}

export const isDesktop = (): boolean => window.jarvis?.desktop === true

export function quitApp() {
  void window.jarvis?.quit()
}

export function minimizeApp() {
  void window.jarvis?.minimize()
}

export async function getAutolaunch(): Promise<boolean> {
  return (await window.jarvis?.getAutolaunch()) ?? false
}

export async function setAutolaunch(on: boolean): Promise<boolean> {
  return (await window.jarvis?.setAutolaunch(on)) ?? false
}

const NOT_DESKTOP = 'That requires the desktop app — currently running in a browser.'

export async function osTypeText(text: string): Promise<string> {
  return (await window.jarvis?.typeText(text)) ?? NOT_DESKTOP
}

export async function osOpenApp(name: string): Promise<string> {
  return (await window.jarvis?.openApp(name)) ?? NOT_DESKTOP
}

export async function osOpenUrl(url: string): Promise<string> {
  return (await window.jarvis?.openUrl(url)) ?? NOT_DESKTOP
}

export async function osSystemControl(action: string): Promise<string> {
  return (await window.jarvis?.systemControl(action)) ?? NOT_DESKTOP
}
