// VENOM — Windows desktop host (Electron).
// Loads the same assistant UI as the Android app and provides an in-app updater:
// checks GitHub Releases, downloads the newest portable EXE and replaces itself.

const { app, BrowserWindow, ipcMain, shell, desktopCapturer } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const http = require("http");
const { spawn, execFile } = require("child_process");

const REPO_OWNER = "mukimudeen76-ops";
const REPO_NAME = "Venom-ultimate";
// Update manifest on the PUBLIC website (the app repo is private now).
const UPDATE_MANIFEST = "https://mukimudeen76-ops.github.io/VENOM-Website/venom-ultimate-update.json";

let mainWindow = null;

// ---------- helpers ----------

function semverKey(v) {
  const m = String(v || "")
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  return (m[0] || 0) * 1000000 + (m[1] || 0) * 1000 + (m[2] || 0);
}

function httpGet(url, headers, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        httpGet(next, headers, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode >= 400) {
        res.resume();
        reject(new Error("HTTP " + res.statusCode));
        return;
      }
      resolve(res);
    });
    req.on("error", reject);
  });
}

async function getLatestReleaseInfo() {
  try {
    const res = await httpGet(
      UPDATE_MANIFEST,
      { "User-Agent": "VENOM-Desktop" }
    );
    let data = "";
    for await (const chunk of res) data += chunk;
    const manifest = JSON.parse(data);

    const latest = String(manifest.latestVersion || "").replace(/^v/, "");
    const latestKey = semverKey(latest);
    const current = app.getVersion();
    const minKey = semverKey(String(manifest.minVersion || ""));
    const blockedList = Array.isArray(manifest.blockedVersions)
      ? manifest.blockedVersions.map((v) => String(v).replace(/^v/, ""))
      : [];

    return {
      checking: false,
      available: latestKey > semverKey(current) || (minKey > 0 && semverKey(current) < minKey),
      forced: minKey > 0 && semverKey(current) < minKey,
      blocked: !!manifest.killSwitch || blockedList.includes(current.replace(/^v/, "")),
      blockMessage: manifest.blockMessage || "VENOM band kar diya gaya hai.",
      currentVersion: current,
      latestVersion: latest,
      minVersion: String(manifest.minVersion || "").replace(/^v/, ""),
      downloadUrl: manifest.exeUrl || "", // direct in-app update
      releaseNotes: manifest.releaseNotes || "",
      sizeBytes: Number(manifest.sizeBytes) || 0,
      downloading: false,
      progress: 0,
      error: null,
    };
  } catch (e) {
    return null;
  }
}

function downloadFile(url, dest, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpGet(url, { "User-Agent": "VENOM-Desktop" });
      const total = parseInt(res.headers["content-length"] || "0", 10);
      let done = 0;
      const file = fs.createWriteStream(dest);
      res.on("data", (chunk) => {
        done += chunk.length;
        if (total > 0 && onProgress) onProgress(Math.round((done * 100) / total));
      });
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
      file.on("error", reject);
      res.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

// Portable EXE self-update.
// NOTE: electron-builder's portable target runs the app from a temp extraction dir,
// so process.execPath is NOT the original exe. We use PORTABLE_EXECUTABLE_FILE
// (set by electron-builder) to locate the real, user-facing exe and replace it
// in place, then relaunch. The original exe is not locked while running, so the
// replacement happens instantly — no external links, no browser, one tap.
async function installUpdate(url, onProgress) {
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  const targetDir = portableExe ? path.dirname(portableExe) : path.dirname(process.execPath);
  const targetName = portableExe ? path.basename(portableExe) : path.basename(process.execPath);
  const finalExe = path.join(targetDir, targetName);

  const tmpExe = path.join(targetDir, `.VENOM-update-${Date.now()}.exe`);
  try {
    await downloadFile(url, tmpExe, onProgress);
    fs.copyFileSync(tmpExe, finalExe); // overwrites in place
    try { fs.unlinkSync(tmpExe); } catch (_e) { /* ignore */ }
    spawn(finalExe, [], { detached: true, stdio: "ignore" }).unref();
    app.exit(0);
    return { ok: true, message: "Restarting with the new version…" };
  } catch (e) {
    try { fs.unlinkSync(tmpExe); } catch (_e) { /* ignore */ }
    return { ok: false, message: "Update failed: " + (e && e.message ? e.message : e) };
  }
}

// ---------- window ----------

function createWindow() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 420,
    minHeight: 640,
    backgroundColor: "#050505",
    autoHideMenuBar: true,
    title: "VENOM",
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Smooth startup: show only when the UI has rendered (no white flash)
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------- IPC (in-app updater) ----------

ipcMain.handle("update:check", async () => {
  const info = await getLatestReleaseInfo();
  return (
    info || {
      checking: false,
      available: false,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      downloadUrl: "",
      releaseNotes: "",
      sizeBytes: 0,
      downloading: false,
      progress: 0,
      error: "Update check unavailable",
    }
  );
});

ipcMain.handle("update:install", async (_e, url) => {
  const u = url || (await getLatestReleaseInfo())?.downloadUrl;
  if (!u) return { ok: false, message: "No update found" };
  return installUpdate(u, (pct) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update:progress", {
        checking: false,
        available: true,
        currentVersion: app.getVersion(),
        latestVersion: "",
        downloadUrl: u,
        releaseNotes: "",
        sizeBytes: 0,
        downloading: true,
        progress: pct,
        error: null,
      });
    }
  });
});

// ===================== Desktop system control (like the Android bridge) =====================

function runPowershell(script) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve((stdout || "").trim() || "");
          return;
        }
        resolve((stdout || "").trim());
      }
    );
  });
}

function escPS(s) {
  return String(s || "").replace(/'/g, "''");
}

const URL_APPS = {
  whatsapp: "https://web.whatsapp.com",
  youtube: "https://www.youtube.com",
  instagram: "https://www.instagram.com",
  facebook: "https://www.facebook.com",
  twitter: "https://twitter.com",
  x: "https://x.com",
  spotify: "https://open.spotify.com",
  netflix: "https://www.netflix.com",
  gmail: "https://mail.google.com",
  maps: "https://maps.google.com",
  google: "https://www.google.com",
  telegram: "https://web.telegram.org",
  chatgpt: "https://chatgpt.com",
  gemini: "https://gemini.google.com",
};

async function openApp(name) {
  const key = String(name || "").toLowerCase().trim();
  if (!key) return { ok: false, message: "No app specified" };
  if (URL_APPS[key] || key.includes(".")) {
    shell.openExternal(URL_APPS[key] || `https://${key}`);
    return { ok: true, message: `Opening ${name} in your browser.` };
  }
  const out = await runPowershell(
    `$a = Get-StartApps | Where-Object { $_.Name -like '*${escPS(name)}*' } | Select-Object -First 1; if ($a) { Start-Process $a.AppID; 'ok' } else { 'notfound' }`
  );
  if (out === "ok") return { ok: true, message: `Opening ${name}.` };
  // Fallback: try the classic runbox exe name
  await runPowershell(`Start-Process '${escPS(name)}' -ErrorAction SilentlyContinue`);
  return { ok: true, message: `Trying to open ${name}.` };
}

async function closeApp(name) {
  const key = String(name || "").toLowerCase().trim();
  const out = await runPowershell(
    `Get-Process | Where-Object { ($_.ProcessName -like '*${escPS(key)}*') -or ($_.MainWindowTitle -like '*${escPS(key)}*') } | Stop-Process -Force -ErrorAction SilentlyContinue; 'ok'`
  );
  return { ok: true, message: out === "ok" ? `Closed ${name}.` : "Close command sent." };
}

const MEDIA_VK = {
  playpause: 0xb3,
  play: 0xb3,
  pause: 0xb3,
  next: 0xb0,
  prev: 0xb1,
  previous: 0xb1,
  stop: 0xb2,
  volumeup: 0xaf,
  volumedown: 0xae,
  mute: 0xad,
  unmute: 0xad,
};

function media(action) {
  const vk = MEDIA_VK[String(action || "").toLowerCase().trim()] || MEDIA_VK.playpause;
  return runPowershell(
    `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class K{[DllImport("user32.dll")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,System.UIntPtr dwExtraInfo);}'; [K]::keybd_event(${vk},0,0,[System.UIntPtr]::Zero); [K]::keybd_event(${vk},0,2,[System.UIntPtr]::Zero); 'ok'`
  );
}

function volume(percent) {
  const v = Math.max(0, Math.min(100, Number(percent) || 50));
  return runPowershell(
    `Add-Type -Namespace W -Name A -MemberDefinition '[DllImport("winmm.dll")] public static extern int waveOutSetVolume(System.IntPtr hwo, uint dwVolume);'; [W.A]::waveOutSetVolume([System.IntPtr]::Zero, [uint32](${v} * 65535 / 100)); 'ok'`
  );
}

function brightness(value) {
  let pct = 50;
  if (typeof value === "number") pct = value;
  else if (String(value).toUpperCase() === "UP") pct = 100;
  else if (String(value).toUpperCase() === "DOWN") pct = 0;
  pct = Math.max(0, Math.min(100, pct));
  return runPowershell(
    `try { $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop; $m.WmiSetBrightness(1, ${pct}); 'ok' } catch { 'unsupported' }`
  );
}

async function battery() {
  const out = await runPowershell(
    `$b = Get-CimInstance Win32_Battery; if ($b) { "$($b.EstimatedChargeRemaining)|$($b.BatteryStatus)" } else { "88|2" }`
  );
  const parts = String(out).split("|");
  const level = parseInt(parts[0], 10);
  const status = parts[1];
  return {
    level: isNaN(level) ? 88 : level,
    isCharging: String(status) === "2",
  };
}

async function screenshot() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1280, height: 720 },
    });
    const primary = sources && sources[0];
    if (primary && primary.thumbnail && primary.thumbnail.toDataURL) {
      return primary.thumbnail.toDataURL();
    }
    return null;
  } catch (e) {
    console.error("screenshot failed", e);
    return null;
  }
}

// Continuous real screen share: captures the actual desktop every second and
// streams frames to the renderer so Venom can SEE what's happening — like the
// Android MediaProjection path.
let screenShareTimer = null;
let screenShareSender = null;

async function captureDesktopFrame() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1280, height: 720 },
    });
    const primary = sources && sources[0];
    if (primary && primary.thumbnail && primary.thumbnail.toDataURL) {
      return primary.thumbnail.toDataURL();
    }
    return null;
  } catch (e) {
    console.error("desktop frame capture failed", e);
    return null;
  }
}

function startScreenShareStream(event) {
  screenShareSender = event.sender;
  if (screenShareTimer) return true;
  screenShareTimer = setInterval(async () => {
    const frame = await captureDesktopFrame();
    if (frame && screenShareSender && !screenShareSender.isDestroyed()) {
      screenShareSender.send("system:screenFrame", frame);
    }
  }, 1000);
  return true;
}

function stopScreenShareStream() {
  if (screenShareTimer) {
    clearInterval(screenShareTimer);
    screenShareTimer = null;
  }
  screenShareSender = null;
  return true;
}

function notifications() {
  // Windows does not expose other apps' notification history via a public API.
  // Return empty gracefully; VENOM still reads & controls the rest of the system.
  return Promise.resolve([]);
}

function speak(text) {
  const safe = escPS(String(text || ""));
  return runPowershell(
    `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 0; $s.Speak('${safe}'); 'ok'`
  );
}

// ---------- IPC (system control) ----------

ipcMain.handle("system:openApp", (_e, name) => openApp(name));
ipcMain.handle("system:closeApp", (_e, name) => closeApp(name));
ipcMain.handle("system:media", (_e, action) => media(action));
ipcMain.handle("system:volume", (_e, pct) => volume(pct));
ipcMain.handle("system:brightness", (_e, v) => brightness(v));
ipcMain.handle("system:battery", () => battery());
ipcMain.handle("system:screenshot", () => screenshot());
ipcMain.handle("system:startScreenShare", (event) => startScreenShareStream(event));
ipcMain.handle("system:stopScreenShare", () => stopScreenShareStream());
ipcMain.handle("system:notifications", () => notifications());
ipcMain.handle("system:speak", (_e, text) => speak(text));

// ---------- lifecycle ----------

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
