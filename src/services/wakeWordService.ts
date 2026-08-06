import { NativeBridge } from "./nativeBridge";

type WakeWordCallback = (phrase: string) => void;

class WakeWordService {
  private recognition: any = null;
  private isListening = false;
  private status: "idle" | "listening" | "error" | "unsupported" = "idle";
  private lastError: string | null = null;
  private onWakeWordDetected: WakeWordCallback | null = null;
  private lastTriggerTime = 0;
  private audioContext: AudioContext | null = null;

  public getStatus() {
    return this.status;
  }

  public getLastError() {
    return this.lastError;
  }

  public init(callback: WakeWordCallback) {
    this.onWakeWordDetected = callback;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.status = "unsupported";
    }
  }

  // Play a quick, clean activation tone when "Wake Venom" is detected
  public playActivationTone() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext || this.audioContext.state === "closed") {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, this.audioContext.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, this.audioContext.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start();
      osc.stop(this.audioContext.currentTime + 0.22);
    } catch (e) {
      console.error("Failed to play activation tone:", e);
    }
  }

  public start() {
    if (this.isListening) return;
    if (!NativeBridge.isWakeWordEnabled()) {
      this.status = "idle";
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.status = "unsupported";
      console.warn("SpeechRecognition not supported in this browser environment.");
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = "en-IN"; // Use Indian English as default for better accent recognition

      this.recognition.onresult = (event: any) => {
        const now = Date.now();
        // Cooldown of 2 seconds between triggers
        if (now - this.lastTriggerTime < 2000) return;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.toLowerCase().trim();
          
          if (
            transcript.includes("wake venom") ||
            transcript.includes("wake up venom") ||
            transcript.includes("hello venom") ||
            transcript.includes("ok venom") ||
            transcript.includes("hi venom") ||
            transcript.includes("hey venom") ||
            transcript.includes("listen venom") ||
            transcript.includes("activate venom") ||
            transcript.includes("wakeupvenom") ||
            transcript.includes("wake-up venom") ||
            transcript.includes("wake up") ||
            transcript.includes("venom")
          ) {
            console.log("Wake word detected in browser:", transcript);
            this.lastTriggerTime = now;
            this.playActivationTone();
            
            if (this.onWakeWordDetected) {
              this.onWakeWordDetected(transcript);
            }
            break;
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        this.lastError = event.error;
        // Ignore aborted or no-speech errors gracefully
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("Wake word recognition error:", event.error);
          this.status = "error";
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.status === "listening") {
          this.status = "idle";
        }
        // Auto-restart if wake word is enabled and session is not active
        if (NativeBridge.isWakeWordEnabled()) {
          setTimeout(() => {
            if (!this.isListening && NativeBridge.isWakeWordEnabled()) {
              this.start();
            }
          }, 300);
        }
      };

      this.recognition.start();
      this.isListening = true;
      this.status = "listening";
      this.lastError = null;
      console.log("Background wake-word service active ('Wake Venom').");
    } catch (e: any) {
      console.error("Failed to start wake word listener:", e);
      this.isListening = false;
      this.status = "error";
      this.lastError = e?.message || "Unknown error";
    }
  }

  public stop() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
      this.recognition = null;
    }
  }
}

export const wakeWordService = new WakeWordService();
