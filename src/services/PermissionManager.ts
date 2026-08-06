// PermissionManager.ts
// Handles native Android bridge & browser runtime permission checks

declare global {
  interface Window {
    bridge?: {
      requestRecordAudio?: () => Promise<boolean> | boolean;
      checkNotificationAccess?: () => Promise<boolean> | boolean;
      checkAccessibilityAccess?: () => Promise<boolean> | boolean;
      requestScreenCapture?: () => Promise<boolean> | boolean;
      stopScreenCapture?: () => void;
      getScreenFrame?: () => string;
    };
  }
}

export class PermissionManager {
  private static getBridge() {
    if (typeof window === "undefined") return null;
    return window.bridge || (window.AndroidBridge as any) || null;
  }

  /**
   * Explicitly requests microphone audio permission
   */
  static async requestRecordAudio(): Promise<boolean> {
    const bridge = this.getBridge();
    if (bridge && typeof bridge.requestRecordAudio === "function") {
      try {
        const result = await bridge.requestRecordAudio();
        return !!result;
      } catch (e) {
        console.error("PermissionManager.requestRecordAudio error:", e);
      }
    }

    // Standard Browser / WebView runtime request
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      console.warn("Microphone access denied:", err);
      return false;
    }
  }

  /**
   * Checks or opens special Notification Access settings
   */
  static async checkNotificationAccess(): Promise<boolean> {
    const bridge = this.getBridge();
    if (bridge && typeof bridge.checkNotificationAccess === "function") {
      try {
        const result = await bridge.checkNotificationAccess();
        return !!result;
      } catch (e) {
        console.error("PermissionManager.checkNotificationAccess error:", e);
      }
    }

    // Fallback based on persisted user grant in local storage
    return localStorage.getItem("venom_perm_notification") === "true";
  }

  /**
   * Checks or opens special Accessibility Service settings
   */
  static async checkAccessibilityAccess(): Promise<boolean> {
    const bridge = this.getBridge();
    if (bridge && typeof bridge.checkAccessibilityAccess === "function") {
      try {
        const result = await bridge.checkAccessibilityAccess();
        return !!result;
      } catch (e) {
        console.error("PermissionManager.checkAccessibilityAccess error:", e);
      }
    }

    return localStorage.getItem("venom_perm_accessibility") === "true";
  }
}
