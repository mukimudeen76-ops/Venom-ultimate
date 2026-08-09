// VENOM desktop preload — exposes a minimal, safe updater API to the web layer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("venomDesktop", {
  update: {
    check: () => ipcRenderer.invoke("update:check"),
    install: (url) => ipcRenderer.invoke("update:install", url),
    onProgress: (cb) => {
      ipcRenderer.on("update:progress", (_event, info) => cb(info));
    },
  },
  control: {
    openApp: (name) => ipcRenderer.invoke("system:openApp", name),
    closeApp: (name) => ipcRenderer.invoke("system:closeApp", name),
    media: (action) => ipcRenderer.invoke("system:media", action),
    volume: (percent) => ipcRenderer.invoke("system:volume", percent),
    brightness: (value) => ipcRenderer.invoke("system:brightness", value),
    battery: () => ipcRenderer.invoke("system:battery"),
    screenshot: () => ipcRenderer.invoke("system:screenshot"),
    startScreenShare: (cb) => {
      ipcRenderer.on("system:screenFrame", (_event, frame) => cb(frame));
      return ipcRenderer.invoke("system:startScreenShare");
    },
    stopScreenShare: () => ipcRenderer.invoke("system:stopScreenShare"),
    notifications: () => ipcRenderer.invoke("system:notifications"),
    speak: (text) => ipcRenderer.invoke("system:speak", text),
  },
});
