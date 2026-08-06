// Bridge interface for interacting with native Android host or browser fallback

export interface NotificationItem {
  id: string;
  packageName: string;
  title: string;
  text: string;
  timestamp: number;
}

export interface BatteryInfo {
  level: number;
  isCharging: boolean;
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  accuracy: number;
}

declare global {
  interface Window {
    AndroidBridge?: {
      getApiKey: () => string;
      setApiKey: (key: string) => void;
      openApp: (appNameOrPackage: string) => boolean;
      closeApp: () => boolean;
      goBack: () => boolean;
      readNotifications: () => string; // JSON array of NotificationItem
      replyNotification: (id: string, message: string) => boolean;
      toggleFlashlight: (enable: boolean) => boolean;
      getBatteryStatus: () => string; // JSON BatteryInfo
      getLocation: () => string; // JSON LocationInfo
      setWakeWordEnabled: (enabled: boolean) => void;
      setClapWakeEnabled: (enabled: boolean) => void;
      setLiveSessionActive: (active: boolean) => void;
      openSettingsPermission: (permissionType: string) => void;
      speakText: (text: string) => void;
      getVoiceName: () => string;
      setVoiceName: (voice: string) => void;
      resolveContact: (nameQuery: string) => string;
      callContact: (phoneNumber: string) => boolean;
      getScreenContext: () => string;
      typeAccessibilityText: (text: string) => boolean;
      clickAccessibilityNode: (targetText: string) => boolean;
      captureNativeScreen: () => string;
      sendSms: (phoneNumber: string, message: string) => string;
      setAlarm: (hour: number, minute: number, label: string) => string;
      setTimer: (seconds: number, label: string) => string;
      controlMedia: (action: string) => string;
      setVolume: (streamType: string, levelPercent: number) => string;
      setBrightness: (levelPercent: number) => string;
      openSettingsScreen: (settingType: string) => string;
      takePhoto: () => string;
    };
  }
}

export class NativeBridge {
  static isAndroidNative(): boolean {
    return typeof window !== "undefined" && !!window.AndroidBridge;
  }

  static getApiKey(): string {
    if (this.isAndroidNative()) {
      try {
        const key = window.AndroidBridge!.getApiKey();
        if (key && key.trim().length > 0) return key;
      } catch (e) {
        console.error("Failed to read key from native AndroidBridge", e);
      }
    }
    
    // Web fallback: ONLY use local storage.
    const local = localStorage.getItem("venom_api_key");
    if (local !== null) return local; // Allow empty string if user explicitly cleared it
    
    return process.env.GEMINI_API_KEY || "";
  }

  static setApiKey(key: string): void {
    const trimmed = key.trim();
    localStorage.setItem("venom_api_key", trimmed);
    if (this.isAndroidNative()) {
      try {
        window.AndroidBridge!.setApiKey(trimmed);
      } catch (e) {
        console.error("Failed to save key to native AndroidBridge", e);
      }
    }
  }

  static getVoiceName(): string {
    if (this.isAndroidNative()) {
      try {
        const v = window.AndroidBridge!.getVoiceName();
        if (v) return v;
      } catch (e) {
        // fallback
      }
    }
    return localStorage.getItem("venom_voice_name") || "Puck"; // Default male voice
  }

  static setVoiceName(voice: string): void {
    localStorage.setItem("venom_voice_name", voice);
    if (this.isAndroidNative()) {
      try {
        window.AndroidBridge!.setVoiceName(voice);
      } catch (e) {
        // fallback
      }
    }
  }

  static openApp(appName: string): { success: boolean; message: string } {
    if (this.isAndroidNative()) {
      try {
        const ok = window.AndroidBridge!.openApp(appName);
        if (ok) return { success: true, message: `Opening ${appName} on your phone.` };
      } catch (e) {
        console.error("Native openApp failed", e);
      }
    }
    // Web fallback
    const appLower = appName.toLowerCase().replace(/\s+/g, "");
    let url = `https://www.${appLower}.com`;
    if (appLower.includes("spotify")) url = "https://open.spotify.com";
    if (appLower.includes("youtube")) url = "https://www.youtube.com";
    if (appLower.includes("whatsapp")) url = "https://web.whatsapp.com";
    
    window.open(url, "_blank");
    return { success: true, message: `Opening ${appName} in web browser.` };
  }

  static closeApp(): { success: boolean; message: string } {
    if (this.isAndroidNative()) {
      try {
        const ok = window.AndroidBridge!.closeApp();
        if (ok) return { success: true, message: "Closing active application." };
      } catch (e) {
        console.error("Native closeApp failed", e);
      }
    }
    return { success: true, message: "Returned to home screen." };
  }

  static goBack(): { success: boolean; message: string } {
    if (this.isAndroidNative()) {
      try {
        const ok = window.AndroidBridge!.goBack();
        if (ok) return { success: true, message: "Going back." };
      } catch (e) {
        console.error("Native goBack failed", e);
      }
    }
    return { success: true, message: "Navigated back." };
  }

  static sendSms(phoneNumber: string, message: string): string {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.sendSms(phoneNumber, message);
      } catch (e) {
        console.error("sendSms error", e);
      }
    }
    return `Opening SMS to ${phoneNumber} with message: "${message}".`;
  }

  static setAlarm(hour: number, minute: number, label: string): string {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.setAlarm(hour, minute, label);
      } catch (e) {
        console.error("setAlarm error", e);
      }
    }
    return `Alarm set for ${hour}:${minute < 10 ? "0" + minute : minute} (${label}).`;
  }

  static setTimer(seconds: number, label: string): string {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.setTimer(seconds, label);
      } catch (e) {
        console.error("setTimer error", e);
      }
    }
    return `Timer set for ${seconds} seconds (${label}).`;
  }

  static controlMedia(action: string): string {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.controlMedia(action);
      } catch (e) {
        console.error("controlMedia error", e);
      }
    }
    return `Media command '${action}' triggered.`;
  }

  static openSettingsScreen(settingType: string): string {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.openSettingsScreen(settingType);
      } catch (e) {
        console.error("openSettingsScreen error", e);
      }
    }
    return `Opened ${settingType} settings.`;
  }

  static takePhoto(): string {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.takePhoto();
      } catch (e) {
        console.error("takePhoto error", e);
      }
    }
    return "Camera opened.";
  }

  static toggleFlashlight(state: boolean): { success: boolean; message: string } {
    if (this.isAndroidNative()) {
      try {
        const ok = window.AndroidBridge!.toggleFlashlight(state);
        if (ok) return { success: true, message: `Flashlight turned ${state ? "ON" : "OFF"}.` };
      } catch (e) {
        console.error("Flashlight error", e);
      }
    }
    return { success: false, message: `Flashlight control requires the native Android app.` };
  }

  static async getBatteryStatus(): Promise<BatteryInfo> {
    if (this.isAndroidNative()) {
      try {
        const raw = window.AndroidBridge!.getBatteryStatus();
        if (raw) return JSON.parse(raw);
      } catch (e) {
        console.error("Battery bridge error", e);
      }
    }
    // Web fallback battery API
    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      try {
        const b: any = await (navigator as any).getBattery();
        return {
          level: Math.round(b.level * 100),
          isCharging: b.charging,
        };
      } catch (e) {
        // ignore
      }
    }
    return { level: 88, isCharging: false };
  }

  static async getLocation(): Promise<LocationInfo | null> {
    if (this.isAndroidNative()) {
      try {
        const raw = window.AndroidBridge!.getLocation();
        if (raw) return JSON.parse(raw);
      } catch (e) {
        console.error("Location bridge error", e);
      }
    }
    // Browser fallback
    return new Promise((resolve) => {
      if (typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
          () => resolve(null)
        );
      } else {
        resolve(null);
      }
    });
  }

  static readNotifications(): NotificationItem[] {
    if (this.isAndroidNative()) {
      try {
        const raw = window.AndroidBridge!.readNotifications();
        if (raw) return JSON.parse(raw);
      } catch (e) {
        console.error("Read notifications bridge error", e);
      }
    }
    return [];
  }

  static replyNotification(id: string, text: string): boolean {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.replyNotification(id, text);
      } catch (e) {
        console.error("Reply notification error", e);
      }
    }
    console.log(`[Web Simulation] Replying to notification ${id}: ${text}`);
    return true;
  }

  static setWakeWordEnabled(enabled: boolean): void {
    localStorage.setItem("venom_wakeword_enabled", String(enabled));
    if (this.isAndroidNative()) {
      try {
        window.AndroidBridge!.setWakeWordEnabled(enabled);
      } catch (e) {
        // fallback
      }
    }
  }

  static isWakeWordEnabled(): boolean {
    return localStorage.getItem("venom_wakeword_enabled") !== "false";
  }

  static setClapWakeEnabled(enabled: boolean): void {
    localStorage.setItem("venom_clapwake_enabled", String(enabled));
    if (this.isAndroidNative()) {
      try {
        window.AndroidBridge!.setClapWakeEnabled(enabled);
      } catch (e) {
        // fallback
      }
    }
  }

  static setLiveSessionActive(active: boolean): void {
    if (this.isAndroidNative()) {
      try {
        window.AndroidBridge!.setLiveSessionActive(active);
      } catch (e) {
        console.error("Failed to notify native bridge of live session state", e);
      }
    }
  }

  static isClapWakeEnabled(): boolean {
    return localStorage.getItem("venom_clapwake_enabled") === "true";
  }

  static setNoiseSuppressionEnabled(enabled: boolean): void {
    localStorage.setItem("venom_noise_suppression_enabled", String(enabled));
  }

  static isNoiseSuppressionEnabled(): boolean {
    return localStorage.getItem("venom_noise_suppression_enabled") !== "false";
  }

  static openSettingsPermission(type: string): void {
    if (this.isAndroidNative()) {
      try {
        window.AndroidBridge!.openSettingsPermission(type);
      } catch (e) {
        console.error("Permission settings trigger error", e);
      }
    }
  }

  static resolveContact(nameQuery: string): { name: string; number: string }[] {
    if (this.isAndroidNative()) {
      try {
        const raw = window.AndroidBridge!.resolveContact(nameQuery);
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed.matches || [];
        }
      } catch (e) {
        console.error("resolveContact error", e);
      }
    }
    return [];
  }

  static callContact(phoneNumber: string): boolean {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.callContact(phoneNumber);
      } catch (e) {
        console.error("callContact error", e);
      }
    }
    window.open(`tel:${phoneNumber}`, "_self");
    return true;
  }

  static getScreenContext(): any {
    if (this.isAndroidNative()) {
      try {
        const raw = window.AndroidBridge!.getScreenContext();
        if (raw) return JSON.parse(raw);
      } catch (e) {
        console.error("getScreenContext error", e);
      }
    }
    return { packageName: "com.novax.venom", nodes: [] };
  }

  static typeAccessibilityText(text: string): boolean {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.typeAccessibilityText(text);
      } catch (e) {
        console.error("typeAccessibilityText error", e);
      }
    }
    return false;
  }

  static clickAccessibilityNode(targetText: string): boolean {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.clickAccessibilityNode(targetText);
      } catch (e) {
        console.error("clickAccessibilityNode error", e);
      }
    }
    return false;
  }

  static captureNativeScreen(): string | null {
    if (this.isAndroidNative()) {
      try {
        const dataUrl = window.AndroidBridge!.captureNativeScreen();
        if (dataUrl && dataUrl.startsWith("data:image/jpeg;base64,")) {
          return dataUrl;
        }
      } catch (e) {
        console.error("captureNativeScreen error", e);
      }
    }
    return null;
  }

  static setVolume(streamTypeOrDirection: string, levelPercent?: number): string {
    if (this.isAndroidNative()) {
      try {
        let level = 0.5;
        let stream = "STREAM_MUSIC";

        if (typeof levelPercent === "number") {
          level = levelPercent;
          stream = streamTypeOrDirection;
        } else {
          level = streamTypeOrDirection === "UP" ? 1.0 : 0.0;
        }

        return window.AndroidBridge!.setVolume(stream, level);
      } catch (e) {
        console.error("setVolume error", e);
      }
    }
    return `Volume adjusted (simulated).`;
  }

  static setBrightness(direction: "UP" | "DOWN"): string {
    if (this.isAndroidNative()) {
      try {
        return window.AndroidBridge!.setBrightness(direction === "UP" ? 1.0 : 0.0);
      } catch (e) {
        console.error("setBrightness error", e);
      }
    }
    return `Brightness ${direction.toLowerCase()} (simulated)`;
  }
}
