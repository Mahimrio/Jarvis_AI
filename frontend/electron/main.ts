import { app, BrowserWindow, globalShortcut, ipcMain, session, shell } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
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

// the packaged exe can live anywhere — locate the Python backend by candidates:
// env var → backend-path.txt next to the exe → backend/ next to the exe → dev repo
function findBackendDir(): string | null {
  const exeDir = path.dirname(app.getPath('exe'))
  const candidates: string[] = []
  if (process.env.JARVIS_BACKEND) candidates.push(process.env.JARVIS_BACKEND)
  try {
    const hint = path.join(exeDir, 'backend-path.txt')
    if (fs.existsSync(hint)) candidates.push(fs.readFileSync(hint, 'utf8').trim())
  } catch {
    /* unreadable hint file */
  }
  candidates.push(
    path.join(exeDir, 'backend'),
    path.join(__dirname, '..', '..', 'backend'),
    'F:\\Personal AI assistant\\Jarvis\\backend', // this machine's dev checkout
  )
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, '.venv', 'Scripts', 'uvicorn.exe'))) return dir
  }
  return null
}

function ensureBackend() {
  const probe = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, () => {
    probe.destroy() // already running (dev terminal) — don't double-spawn
  })
  probe.on('error', () => {
    const backendDir = findBackendDir()
    if (!backendDir) return
    backend = spawn(path.join(backendDir, '.venv', 'Scripts', 'uvicorn.exe'), ['main:app', '--port', String(BACKEND_PORT)], {
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

// auto-start with Windows (fully effective once packaged; dev registers the electron binary)
ipcMain.handle('jarvis:autolaunch:get', () => app.getLoginItemSettings().openAtLogin)
ipcMain.handle('jarvis:autolaunch:set', (_e, on: boolean) => {
  app.setLoginItemSettings({ openAtLogin: on })
  return app.getLoginItemSettings().openAtLogin
})

// ---- OS control (PowerShell/system commands — no native modules) ----------

function runPS(command: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { timeout: 15000, windowsHide: true },
      (err) => resolve(err ? `failed: ${err.message.slice(0, 120)}` : 'ok'),
    )
  })
}

ipcMain.handle('jarvis:os:type', async (_e, text: string) => {
  // SendKeys metacharacters must be wrapped in braces; single quotes doubled for PS
  const esc = String(text).slice(0, 500).replace(/([+^%~(){}[\]])/g, '{$1}').replace(/'/g, "''")
  const res = await runPS(
    `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${esc}')`,
  )
  return res === 'ok' ? `Typed into the focused window.` : `Typing ${res}`
})

const APP_ALIASES: Record<string, string> = {
  'vs code': 'code',
  'visual studio code': 'code',
  vscode: 'code',
  calculator: 'calc',
  'file explorer': 'explorer',
  files: 'explorer',
  terminal: 'wt',
  powershell: 'powershell',
  settings: 'ms-settings:',
  paint: 'mspaint',
  word: 'winword',
  excel: 'excel',
}

ipcMain.handle('jarvis:os:open-app', (_e, name: string) => {
  const clean = String(name).toLowerCase().trim().slice(0, 60)
  const target = APP_ALIASES[clean] ?? clean.replace(/[^a-z0-9 ._:-]/g, '')
  if (!target) return 'No app name given.'
  try {
    spawn('cmd.exe', ['/c', 'start', '', target], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    return `Launching ${clean}.`
  } catch (err) {
    return `Could not launch ${clean}: ${err instanceof Error ? err.message : err}`
  }
})

ipcMain.handle('jarvis:os:open-url', async (_e, url: string) => {
  if (!/^https?:\/\//i.test(String(url))) return 'Only http(s) URLs allowed.'
  await shell.openExternal(String(url))
  return `Opened in your default browser.`
})

ipcMain.handle('jarvis:os:system', async (_e, action: string) => {
  switch (action) {
    case 'volume_up':
      return (await runPS('(New-Object -ComObject WScript.Shell).SendKeys([char]175 * 4)')) === 'ok' ? 'Volume up.' : 'Volume control failed.'
    case 'volume_down':
      return (await runPS('(New-Object -ComObject WScript.Shell).SendKeys([char]174 * 4)')) === 'ok' ? 'Volume down.' : 'Volume control failed.'
    case 'mute':
      return (await runPS('(New-Object -ComObject WScript.Shell).SendKeys([char]173)')) === 'ok' ? 'Toggled mute.' : 'Mute failed.'
    case 'lock':
      spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true })
      return 'Locking the workstation.'
    case 'screenshot': {
      const out = path.join(app.getPath('pictures'), `jarvis-screenshot-${Date.now()}.png`)
      const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $bmp.Save('${out.replace(/\\/g, '\\\\')}')`
      const res = await runPS(ps)
      return res === 'ok' ? `Screenshot saved to ${out}` : `Screenshot ${res}`
    }
    case 'shutdown':
      spawn('shutdown.exe', ['/s', '/t', '30'], { windowsHide: true })
      return 'Shutting down in 30 seconds. Say "cancel shutdown" to abort.'
    case 'cancel_shutdown':
      spawn('shutdown.exe', ['/a'], { windowsHide: true })
      return 'Shutdown aborted.'
    default:
      return `Unknown system action ${action}`
  }
})

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
