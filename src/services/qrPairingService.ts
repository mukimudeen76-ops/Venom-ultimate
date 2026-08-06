import { db } from "../lib/firebase";
import { doc, setDoc, onSnapshot, updateDoc, collection } from "firebase/firestore";
import { NativeBridge } from "./nativeBridge";

export interface DevicePairInfo {
  sessionId: string;
  hostDeviceName: string;
  hostPlatform: "desktop" | "android";
  targetDeviceName?: string;
  targetPlatform?: "desktop" | "android";
  status: "waiting" | "connected" | "disconnected";
  createdAt: number;
  lastActive: number;
  lastCommand?: {
    action: string;
    payload: any;
    fromDevice: string;
    timestamp: number;
    status: "pending" | "executed" | "failed";
    result?: string;
  };
}

class QrPairingService {
  private currentSessionId: string | null = null;
  private unsubscribeListener: (() => void) | null = null;
  private onCommandCallback: ((cmd: any) => void) | null = null;
  private onStatusChangeCallback: ((session: DevicePairInfo | null) => void) | null = null;

  public getDeviceId(): string {
    let id = localStorage.getItem("venom_device_id");
    if (!id) {
      id = "venom_dev_" + Math.random().toString(36).substring(2, 11);
      localStorage.setItem("venom_device_id", id);
    }
    return id;
  }

  public getDeviceName(): string {
    if (NativeBridge.isAndroidNative()) {
      return "Android Smartphone (VENOM)";
    }
    const userAgent = navigator.userAgent;
    if (userAgent.includes("Mac")) return "Mac Studio / MacBook";
    if (userAgent.includes("Win")) return "Windows Workstation";
    if (userAgent.includes("Linux")) return "Linux Desktop";
    return "Desktop Workspace";
  }

  public getPlatform(): "desktop" | "android" {
    return NativeBridge.isAndroidNative() ? "android" : "desktop";
  }

  /**
   * Generates a new pairing session payload for QR Code display (Desktop or Host)
   */
  public async createPairingSession(): Promise<string> {
    const sessionId = "pair_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now().toString(36);
    this.currentSessionId = sessionId;

    const payload: DevicePairInfo = {
      sessionId,
      hostDeviceName: this.getDeviceName(),
      hostPlatform: this.getPlatform(),
      status: "waiting",
      createdAt: Date.now(),
      lastActive: Date.now(),
    };

    localStorage.setItem("venom_active_pair_session", sessionId);

    try {
      const docRef = doc(db, "venom_paired_sessions", sessionId);
      await setDoc(docRef, payload);
      this.listenToSession(sessionId);
    } catch (e) {
      console.warn("Firestore offline - utilizing local broadcast channel pairing fallback", e);
      this.startLocalBroadcastSession(sessionId, payload);
    }

    return JSON.stringify({
      venomPair: true,
      sessionId,
      hostName: payload.hostDeviceName,
      hostPlatform: payload.hostPlatform,
      time: payload.createdAt,
    });
  }

  /**
   * Connects to an existing pairing session by scanning QR code (Mobile or Client)
   */
  public async pairWithSession(qrPayloadStr: string): Promise<boolean> {
    try {
      let qrData: any;
      try {
        qrData = JSON.parse(qrPayloadStr);
      } catch (err) {
        throw new Error("Invalid QR code format. Please scan a valid VENOM pairing code.");
      }

      if (!qrData.venomPair || !qrData.sessionId) {
        throw new Error("Unrecognized QR Code. Not a valid VENOM Cross-Device pairing code.");
      }

      const sessionId = qrData.sessionId;
      this.currentSessionId = sessionId;
      localStorage.setItem("venom_active_pair_session", sessionId);

      const targetInfo = {
        targetDeviceName: this.getDeviceName(),
        targetPlatform: this.getPlatform(),
        status: "connected" as const,
        lastActive: Date.now(),
      };

      try {
        const docRef = doc(db, "venom_paired_sessions", sessionId);
        await updateDoc(docRef, targetInfo);
      } catch (e) {
        console.warn("Firestore pair update error - falling back to local channel", e);
        const channel = new BroadcastChannel("venom_qr_pair_" + sessionId);
        channel.postMessage({ type: "PAIRED", targetInfo });
      }

      this.listenToSession(sessionId);
      return true;
    } catch (e: any) {
      console.error("Pairing Error:", e);
      throw e;
    }
  }

  /**
   * Listen for incoming remote commands or status changes
   */
  public listenToSession(sessionId: string) {
    if (this.unsubscribeListener) {
      this.unsubscribeListener();
    }

    try {
      const docRef = doc(db, "venom_paired_sessions", sessionId);
      this.unsubscribeListener = onSnapshot(docRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const session = snapshot.data() as DevicePairInfo;

        if (this.onStatusChangeCallback) {
          this.onStatusChangeCallback(session);
        }

        // Check if there is an unexecuted remote command sent to this device
        if (
          session.lastCommand &&
          session.lastCommand.status === "pending" &&
          session.lastCommand.fromDevice !== this.getDeviceId()
        ) {
          this.executeRemoteCommand(session.lastCommand, sessionId);
        }
      });
    } catch (e) {
      console.warn("Firestore real-time subscription unavailable, using BroadcastChannel", e);
      this.startLocalBroadcastSession(sessionId);
    }
  }

  private startLocalBroadcastSession(sessionId: string, initialPayload?: DevicePairInfo) {
    const channel = new BroadcastChannel("venom_qr_pair_" + sessionId);
    channel.onmessage = (event) => {
      const data = event.data;
      if (data.type === "PAIRED") {
        if (this.onStatusChangeCallback && initialPayload) {
          initialPayload.status = "connected";
          initialPayload.targetDeviceName = data.targetInfo.targetDeviceName;
          initialPayload.targetPlatform = data.targetInfo.targetPlatform;
          this.onStatusChangeCallback(initialPayload);
        }
      } else if (data.type === "COMMAND" && data.command) {
        if (data.command.fromDevice !== this.getDeviceId()) {
          this.executeRemoteCommand(data.command, sessionId);
        }
      }
    };
  }

  /**
   * Execute command received from connected remote device
   */
  private async executeRemoteCommand(cmd: any, sessionId: string) {
    console.log("VENOM Remote Execution Request received:", cmd);
    let result = "Action executed successfully";

    try {
      switch (cmd.action) {
        case "openApp":
          NativeBridge.openApp(cmd.payload.appName || cmd.payload.query);
          result = `Opened app ${cmd.payload.appName} on connected device.`;
          break;
        case "sendMessage":
          NativeBridge.sendSms(cmd.payload.target || cmd.payload.phoneNumber || "contact", cmd.payload.query || cmd.payload.message || "Hello from VENOM");
          result = `Sent message to ${cmd.payload.target || cmd.payload.phoneNumber} via connected device.`;
          break;
        case "placeCall":
          NativeBridge.callContact(cmd.payload.phoneNumber || cmd.payload.contactName || "");
          result = `Initiated call to ${cmd.payload.phoneNumber || cmd.payload.contactName}.`;
          break;
        case "getDeviceTime":
          result = `Device local time: ${new Date().toLocaleTimeString()}`;
          break;
        default:
          if (this.onCommandCallback) {
            this.onCommandCallback(cmd);
          }
          result = `Custom command ${cmd.action} dispatched to active session handlers.`;
      }

      // Update command status to executed
      try {
        const docRef = doc(db, "venom_paired_sessions", sessionId);
        await updateDoc(docRef, {
          "lastCommand.status": "executed",
          "lastCommand.result": result,
          lastActive: Date.now(),
        });
      } catch (e) {
        const channel = new BroadcastChannel("venom_qr_pair_" + sessionId);
        channel.postMessage({ type: "COMMAND_RESULT", result });
      }
    } catch (err: any) {
      console.error("Failed to execute remote command", err);
      try {
        const docRef = doc(db, "venom_paired_sessions", sessionId);
        await updateDoc(docRef, {
          "lastCommand.status": "failed",
          "lastCommand.result": err?.message || "Execution error",
        });
      } catch (e) {}
    }
  }

  /**
   * Dispatch a remote command from current device to paired target device
   */
  public async sendRemoteCommand(action: string, payload: any): Promise<boolean> {
    if (!this.currentSessionId) {
      this.currentSessionId = localStorage.getItem("venom_active_pair_session");
    }
    if (!this.currentSessionId) {
      throw new Error("No active paired device session found. Please scan QR code first.");
    }

    const commandObj = {
      action,
      payload,
      fromDevice: this.getDeviceId(),
      timestamp: Date.now(),
      status: "pending" as const,
    };

    try {
      const docRef = doc(db, "venom_paired_sessions", this.currentSessionId);
      await updateDoc(docRef, {
        lastCommand: commandObj,
        lastActive: Date.now(),
      });
      return true;
    } catch (e) {
      console.warn("Firestore command send error - broadcasting locally", e);
      const channel = new BroadcastChannel("venom_qr_pair_" + this.currentSessionId);
      channel.postMessage({ type: "COMMAND", command: commandObj });
      return true;
    }
  }

  public setCallbacks(
    onStatusChange: (session: DevicePairInfo | null) => void,
    onCommand?: (cmd: any) => void
  ) {
    this.onStatusChangeCallback = onStatusChange;
    this.onCommandCallback = onCommand || null;
  }

  public disconnectSession() {
    if (this.unsubscribeListener) {
      this.unsubscribeListener();
      this.unsubscribeListener = null;
    }
    if (this.currentSessionId) {
      try {
        const docRef = doc(db, "venom_paired_sessions", this.currentSessionId);
        updateDoc(docRef, { status: "disconnected", lastActive: Date.now() });
      } catch (e) {}
    }
    localStorage.removeItem("venom_active_pair_session");
    this.currentSessionId = null;
  }
}

export const qrPairingService = new QrPairingService();
