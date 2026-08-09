// VENOM afterPack hook — stamps the PREMIUM icon + version metadata onto the
// packaged win-unpacked/VENOM.exe right after electron-builder unpacks it,
// so the app shows the premium icon in the taskbar while running.
// (Runs via wine64 + rcedit-x64 — no 32-bit wine needed.)
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const exe = path.join(appOutDir, "VENOM.exe");
  if (!fs.existsSync(exe)) return;

  const ico = path.join(appOutDir, "..", ".icon-ico", "icon.ico");
  const home = process.env.HOME || "/home/user";
  // winCodeSign can extract into winCodeSign/ or winCodeSign-2.6.0/ — try both.
  const candidates = [
    path.join(home, ".cache/electron-builder/winCodeSign/rcedit-x64.exe"),
    path.join(home, ".cache/electron-builder/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe"),
  ];
  const rcedit = candidates.find((c) => fs.existsSync(c));
  if (!rcedit) {
    console.warn("[afterPack] rcedit not found, skipping icon stamp:", candidates);
    return;
  }

  const version = context.packager?.appInfo?.version || "2.1.0";
  const args = [
    rcedit,
    exe,
    "--set-version-string", "ProductName", "VENOM",
    "--set-version-string", "FileDescription", "VENOM - AI Voice Assistant (Windows desktop build)",
    "--set-version-string", "CompanyName", "mukimudeen76-ops",
    "--set-file-version", version,
    "--set-product-version", version + ".0.0",
    ...(fs.existsSync(ico) ? ["--set-icon", ico] : []),
  ];

  try {
    execSync(`wine ${args.map(a => `"${a}"`).join(" ")}`, {
      env: { ...process.env, WINEDEBUG: "-all", XDG_RUNTIME_DIR: "/tmp" },
      stdio: "ignore",
      timeout: 90000,
    });
    console.log("[afterPack] premium icon + version stamped on VENOM.exe ✅");
  } catch (e) {
    console.warn("[afterPack] wine/rcedit failed:", e.message);
  }
};
