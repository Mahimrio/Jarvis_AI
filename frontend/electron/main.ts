import { app, BrowserWindow, globalShortcut, ipcMain, session } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import http from 'node:http'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// the bundle is ESM — reconstruct __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// allow the greeting to speak without a click
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const BACKEND_PORT = 8765

let win: BrowserWindow | null = null
let backend: ChildProcess | null = null
let spawnedBackend = false

// project layout: frontend/dist-electron/main.js → repo root is two levels up
const repoRoot = () =>
  app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..', '..')

function ensureBackend() {
  const probe = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, () => {
    probe.destroy() // already running (dev terminal) — don't double-spawn
  })
  probe.on('error', () => {
    const backendDir = path.join(repoRoot(), 'backend')
    const uvicorn = path.join(backendDir, '.venv', 'Scripts', 'uvicorn.exe')
    if (!fs.existsSync(uvicorn)) return
    backend = spawn(uvicorn, ['main:app', '--port', String(BACKEND_PORT)], {
      cwd: backendDir,
      stdio: 'ignore',
      windowsHide: true,
    })
    spawnedBackend = true
  })
  probe.setTimeout(3000, () => probe.destroy())
}

function createWindow() {
  win = new BrowserWindow({
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // grant mic (wake word / speech) and media without prompts
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'audioCapture', 'notifications'].includes(permission))
  })

  if (DEV_URL) {
    void win.loadURL(DEV_URL)
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // debug: JARVIS_SHOT=1 saves a screenshot so the agent can verify the window
  if (process.env.JARVIS_SHOT) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win?.webContents.capturePage()
        if (img) {
          const out = path.join(repoRoot(), 'frontend', '.tmp-electron')
          fs.mkdirSync(out, { recursive: true })
          fs.writeFileSync(path.join(out, 'shot.png'), img.toPNG())
        }
      }, 6500)
    })
  }
}

ipcMain.handle('jarvis:quit', () => app.quit())
ipcMain.handle('jarvis:minimize', () => win?.minimize())

app.whenReady().then(() => {
  ensureBackend()
  createWindow()
  globalShortcut.register('Control+Q', () => app.quit())
})

app.on('window-all-closed', () => app.quit())

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (spawnedBackend) backend?.kill()
})
