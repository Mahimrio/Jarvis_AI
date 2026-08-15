// typed access to the Electron bridge — everything degrades gracefully in a plain browser
export interface JarvisBridge {
  desktop: boolean
  platform: string
  quit: () => Promise<void>
  minimize: () => Promise<void>
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
