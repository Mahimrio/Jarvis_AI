import { BrowserWindow, app, globalShortcut, ipcMain, session } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
//#region electron/main.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
var DEV_URL = process.env.VITE_DEV_SERVER_URL;
var BACKEND_PORT = 8765;
var win = null;
var backend = null;
var spawnedBackend = false;
var repoRoot = () => app.isPackaged ? path.dirname(app.getPath("exe")) : path.join(__dirname, "..", "..");
function ensureBackend() {
	const probe = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, () => {
		probe.destroy();
	});
	probe.on("error", () => {
		const backendDir = path.join(repoRoot(), "backend");
		const uvicorn = path.join(backendDir, ".venv", "Scripts", "uvicorn.exe");
		if (!fs.existsSync(uvicorn)) return;
		backend = spawn(uvicorn, [
			"main:app",
			"--port",
			String(BACKEND_PORT)
		], {
			cwd: backendDir,
			stdio: "ignore",
			windowsHide: true
		});
		spawnedBackend = true;
	});
	probe.setTimeout(3e3, () => probe.destroy());
}
function createWindow() {
	win = new BrowserWindow({
		fullscreen: true,
		frame: false,
		autoHideMenuBar: true,
		backgroundColor: "#000000",
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
		cb([
			"media",
			"audioCapture",
			"notifications"
		].includes(permission));
	});
	if (DEV_URL) win.loadURL(DEV_URL);
	else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
	if (process.env.JARVIS_SHOT) win.webContents.once("did-finish-load", () => {
		setTimeout(async () => {
			const img = await win?.webContents.capturePage();
			if (img) {
				const out = path.join(repoRoot(), "frontend", ".tmp-electron");
				fs.mkdirSync(out, { recursive: true });
				fs.writeFileSync(path.join(out, "shot.png"), img.toPNG());
			}
		}, 6500);
	});
}
ipcMain.handle("jarvis:quit", () => app.quit());
ipcMain.handle("jarvis:minimize", () => win?.minimize());
app.whenReady().then(() => {
	ensureBackend();
	createWindow();
	globalShortcut.register("Control+Q", () => app.quit());
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
	globalShortcut.unregisterAll();
	if (spawnedBackend) backend?.kill();
});
//#endregion
export {};
