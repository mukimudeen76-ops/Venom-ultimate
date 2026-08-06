import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { NativeBridge } from "./nativeBridge";
import { getDynamicSystemInstruction, getVenomResponse, getVenomAudio } from "./geminiService";
import { memoryService } from "./memoryService";

export class LiveSessionManager {
  private ai: GoogleGenAI | null = null;
  private sessionPromise: Promise<any> | null = null;
  private currentState: "idle" | "listening" | "processing" | "speaking" = "idle";
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private speechRecognizer: any = null;
  private isFallbackMode: boolean = false;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;

  // Real-time Screen Sharing State
  public isScreenSharing: boolean = false;
  private screenStream: MediaStream | null = null;
  private screenVideo: HTMLVideoElement | null = null;
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenInterval: any = null;
  public screenMediaStream: MediaStream | null = null;
  public isManualMode: boolean = false;

  public setIsManualMode(manual: boolean) {
    this.isManualMode = manual;
    // We don't stop the interval here because the interval itself checks isManualMode
    // or we can restart/clear it. Let's make the interval check it.
  }
  public onScreenShareChange: (active: boolean, error?: string) => void = () => {};
  public onScreenFrame: (frameDataUrl: string) => void = () => {};

  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "venom", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};
  public onStatusUpdate: (status: string) => void = () => {};

  private processingTimeout: any = null;

  public sendManualScreenFrame(base64Data: string) {
    if (this.sessionPromise && base64Data) {
      this.onStatusUpdate("Analyzing Visual Frame...");
      this.sessionPromise.then((session) => {
        session.sendRealtimeInput({
          video: { data: base64Data, mimeType: "image/jpeg" },
        });
        // Also send a text prompt to force analysis
        session.sendRealtimeInput({
          text: "Genius, analyze this current screen frame in detail and tell me what you see or what I should do next. Be precise and fast.",
        });
      }).catch((e) => console.error("Manual screen frame send error", e));
    }
  }

  public setState(state: "idle" | "listening" | "processing" | "speaking") {
    this.currentState = state;
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }

    if (state === "processing") {
      this.processingTimeout = setTimeout(() => {
        console.warn("Processing state timeout reached - reverting to listening.");
        this.setState("listening");
      }, 7000);
    }

    this.onStateChange(state);
    if (state !== "processing") {
      this.onStatusUpdate("");
    }
  }

  async startScreenShare() {
    if (this.isScreenSharing) return;

    // 1. Check Native Android Bridge Screen Capture first
    if (NativeBridge.isAndroidNative()) {
      const initialFrame = NativeBridge.captureNativeScreen();
      if (initialFrame) {
        this.isScreenSharing = true;
        this.screenInterval = setInterval(() => {
          if (!this.isScreenSharing || this.isManualMode) return;
          const frameUrl = NativeBridge.captureNativeScreen();
          if (frameUrl) {
            const base64Data = frameUrl.replace(/^data:image\/jpeg;base64,/, "");
            this.onScreenFrame(frameUrl);
            if (this.sessionPromise && base64Data) {
              this.sessionPromise.then((session) => {
                session.sendRealtimeInput({
                  video: { data: base64Data, mimeType: "image/jpeg" },
                });
              }).catch((e) => console.error("Native screen frame send error", e));
            }
          }
        }, 200);

        this.onScreenShareChange(true);
        this.onMessage("venom", "Real-time Android device screen capture active! I am seeing your exact live display.");
        return;
      }
    }

    let useHtml2CanvasFallback = false;

    try {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });

          this.screenStream = stream;
          this.screenMediaStream = stream;
          this.isScreenSharing = true;

          const track = stream.getVideoTracks()[0];
          if (track) {
            track.onended = () => {
              this.stopScreenShare();
            };
          }

          this.screenVideo = document.createElement("video");
          this.screenVideo.autoplay = true;
          this.screenVideo.muted = true;
          this.screenVideo.playsInline = true;
          this.screenVideo.style.position = "fixed";
          this.screenVideo.style.top = "-9999px";
          this.screenVideo.style.left = "-9999px";
          this.screenVideo.style.width = "1px";
          this.screenVideo.style.height = "1px";
          this.screenVideo.style.opacity = "0.01";
          this.screenVideo.style.pointerEvents = "none";
          document.body.appendChild(this.screenVideo);

          this.screenVideo.srcObject = stream;
          await this.screenVideo.play().catch(() => {});

          this.screenCanvas = document.createElement("canvas");
          this.screenCanvas.width = 640;
          this.screenCanvas.height = 360;
          const ctx = this.screenCanvas.getContext("2d");

          this.screenInterval = setInterval(() => {
            if (!this.isScreenSharing || !this.screenVideo || !ctx || !this.screenCanvas || this.isManualMode) return;

            if (this.screenVideo.readyState >= 2) {
              const vw = this.screenVideo.videoWidth || 640;
              const vh = this.screenVideo.videoHeight || 360;
              this.screenCanvas.width = 640;
              this.screenCanvas.height = Math.round((vh / vw) * 640) || 360;

              ctx.fillStyle = "#0f0f18";
              ctx.fillRect(0, 0, this.screenCanvas.width, this.screenCanvas.height);
              ctx.drawImage(this.screenVideo, 0, 0, this.screenCanvas.width, this.screenCanvas.height);

              const dataUrl = this.screenCanvas.toDataURL("image/jpeg", 0.6);
              const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

              this.onScreenFrame(dataUrl);

              if (this.sessionPromise && base64Data) {
                this.sessionPromise.then((session) => {
                  session.sendRealtimeInput({
                    video: { data: base64Data, mimeType: "image/jpeg" },
                  });
                }).catch((e) => console.error("Screen frame send error", e));
              }
            }
          }, 200);

          this.onScreenShareChange(true);
          this.onMessage("venom", "Real-time native screen sharing is active! I am watching your live screen now.");
          return;
        } catch (e) {
          console.warn("getDisplayMedia failed, attempting html2canvas DOM capture fallback:", e);
          useHtml2CanvasFallback = true;
        }
      } else {
        useHtml2CanvasFallback = true;
      }

      if (useHtml2CanvasFallback) {
        const html2canvas = (await import("html2canvas")).default;
        this.isScreenSharing = true;

        this.screenInterval = setInterval(async () => {
          if (!this.isScreenSharing) return;

          try {
            const targetEl = document.getElementById("root") || document.body;
            let canvas: HTMLCanvasElement;
            
            try {
              canvas = await html2canvas(targetEl, {
                scale: 0.65,
                logging: false,
                useCORS: true,
                backgroundColor: "#0f0f18",
                allowTaint: true,
              });
            } catch (canvasErr) {
              canvas = document.createElement("canvas");
              canvas.width = 640;
              canvas.height = 360;
              const fCtx = canvas.getContext("2d");
              if (fCtx) {
                fCtx.fillStyle = "#09090e";
                fCtx.fillRect(0, 0, 640, 360);
                fCtx.fillStyle = "#22d3ee";
                fCtx.font = "bold 16px sans-serif";
                fCtx.fillText("VENOM LIVE APP HUD FRAME", 20, 40);
              }
            }

            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.fillStyle = "rgba(124, 58, 237, 0.85)";
              ctx.fillRect(10, 10, 160, 24);
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 12px sans-serif";
              ctx.fillText(`VENOM LIVE • ${new Date().toLocaleTimeString()}`, 16, 26);
            }

            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

            this.onScreenFrame(dataUrl);

            if (this.sessionPromise && base64Data) {
              const session = await this.sessionPromise;
              session.sendRealtimeInput({
                video: { data: base64Data, mimeType: "image/jpeg" },
              });
            }
          } catch (e) {
            console.error("html2canvas capture error:", e);
          }
        }, 1500);

        this.onScreenShareChange(true);
        this.onMessage("venom", "Real-time view capture active! I can see your current app screen state.");
      }
    } catch (err: any) {
      console.error("Screen share start error:", err);
      this.stopScreenShare();
      this.onScreenShareChange(false, err?.message || "Screen capture denied or unsupported.");
      this.onMessage("venom", "Screen capture consent was denied or failed to initialize.");
    }
  }

  stopScreenShare() {
    if (this.screenInterval) {
      clearInterval(this.screenInterval);
      this.screenInterval = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    if (this.screenVideo) {
      if (this.screenVideo.parentNode) {
        this.screenVideo.parentNode.removeChild(this.screenVideo);
      }
      this.screenVideo.srcObject = null;
      this.screenVideo = null;
    }
    this.screenCanvas = null;

    if (this.isScreenSharing) {
      this.isScreenSharing = false;
      this.onScreenShareChange(false);
    }
  }

  private startFallbackSpeechRecognition() {
    if (this.isFallbackMode) return;
    this.isFallbackMode = true;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.onMessage("venom", "I'm online. Please type your message or check your Gemini API key in Settings.");
      this.setState("idle");
      return;
    }

    try {
      this.speechRecognizer = new SpeechRecognition();
      this.speechRecognizer.continuous = true;
      this.speechRecognizer.interimResults = false;
      this.speechRecognizer.lang = navigator.language || "hi-IN";

      this.setState("listening");

      this.speechRecognizer.onresult = async (event: any) => {
        const resultsIndex = event.results.length - 1;
        const transcript = event.results[resultsIndex][0].transcript.trim();
        if (!transcript) return;

        this.onMessage("user", transcript);
        this.setState("processing");

        try {
          this.speechRecognizer.stop();
        } catch(e) {}

        const reply = await getVenomResponse(transcript);
        this.onMessage("venom", reply);

        const audioBase64 = await getVenomAudio(reply);
        if (audioBase64) {
          this.setState("speaking");
          this.playAudioChunk(audioBase64);
        } else {
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            const synth = window.speechSynthesis;
            const utter = new SpeechSynthesisUtterance(reply);
            utter.onend = () => {
              this.setState("listening");
              if (this.isFallbackMode) {
                try { this.speechRecognizer?.start(); } catch(e){}
              }
            };
            this.setState("speaking");
            synth.speak(utter);
            return;
          }
          this.setState("listening");
          if (this.isFallbackMode) {
            try { this.speechRecognizer?.start(); } catch(e){}
          }
        }
      };

      this.speechRecognizer.onerror = (err: any) => {
        console.warn("Fallback Speech Recognition Error:", err);
      };

      this.speechRecognizer.onend = () => {
        if (this.isFallbackMode && this.currentState === "listening") {
          try { this.speechRecognizer.start(); } catch(e){}
        }
      };

      this.speechRecognizer.start();
    } catch (e) {
      console.error("Fallback Speech Recognition Init Error:", e);
      this.setState("idle");
    }
  }

  async start() {
    try {
      const apiKey = NativeBridge.getApiKey();
      if (!apiKey) {
        this.onMessage("venom", "Please click the Settings gear icon in the top header to enter your Gemini API Key first!");
        this.onStateChange("idle");
        return;
      }

      this.ai = new GoogleGenAI({ apiKey });
      this.onStateChange("processing");
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio API (AudioContext) is not supported in this browser environment.");
      }

      let audioCtx: AudioContext;
      try {
        audioCtx = new AudioContextClass({ sampleRate: 16000 });
      } catch (e) {
        console.warn("Creating AudioContext with sampleRate: 16000 failed, falling back to default options:", e);
        audioCtx = new AudioContextClass();
      }
      this.audioContext = audioCtx;
      if (this.audioContext.state === "suspended") await this.audioContext.resume();

      let playbackCtx: AudioContext;
      try {
        playbackCtx = new AudioContextClass({ sampleRate: 24000 });
      } catch (e) {
        console.warn("Creating Playback AudioContext with sampleRate: 24000 failed, falling back to default options:", e);
        playbackCtx = new AudioContextClass();
      }
      this.playbackContext = playbackCtx;
      this.nextPlayTime = this.playbackContext.currentTime;

      // Get Microphone
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone input is not supported or permission APIs are unavailable in this browser.");
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      // Guard against concurrent stop or clean up that occurred during the getUserMedia await
      if (!this.audioContext || !this.playbackContext) {
        console.warn("LiveSessionManager: session was stopped or cleaned up during getUserMedia.");
        return;
      }

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise || this.isFallbackMode) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(() => {});
      };

      if (NativeBridge.isNoiseSuppressionEnabled()) {
        const hpFilter = this.audioContext.createBiquadFilter();
        hpFilter.type = "highpass";
        hpFilter.frequency.value = 85; // Cut off low frequency hum/rumble below 85Hz

        const lpFilter = this.audioContext.createBiquadFilter();
        lpFilter.type = "lowpass";
        lpFilter.frequency.value = 3200; // Cut off high frequency noise/clicks above 3200Hz

        this.source.connect(hpFilter);
        hpFilter.connect(lpFilter);
        lpFilter.connect(this.processor);
        console.log("VENOM Audio Engine: Active Noise Filtering & Vocal Focus is active.");
      } else {
        this.source.connect(this.processor);
      }
      
      // Keep processor connected to destination via silent gain node so onaudioprocess continues firing without speaker feedback
      try {
        const feedbackGain = this.audioContext.createGain();
        feedbackGain.gain.value = 0; // Silent gain prevents feedback loop into speakers while keeping audio processing active
        this.processor.connect(feedbackGain);
        feedbackGain.connect(this.audioContext.destination);
      } catch (e) {
        console.warn("Could not connect audio feedback node:", e);
      }

      const selectedVoice = NativeBridge.getVoiceName() || "Puck"; // Default male voice

      // Connect to Live API
      const livePromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
          },
          systemInstruction: getDynamicSystemInstruction(),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a web action (YouTube, Spotify, WhatsApp, search).",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type: 'open', 'youtube', 'spotify', 'whatsapp'" },
                    query: { type: Type.STRING, description: "The search query, website name, or message content." },
                    target: { type: Type.STRING, description: "The target phone number or contact." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "openApp",
                description: "Open an installed application on the user's phone or desktop.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    appName: { type: Type.STRING, description: "Name of the app to launch." }
                  },
                  required: ["appName"]
                }
              },
              {
                name: "closeApp",
                description: "Close or minimize the current application and return to home screen.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {}
                }
              },
              {
                name: "resolveContact",
                description: "Find contact details (phone numbers) by exact or partial name match.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    nameQuery: { type: Type.STRING, description: "Contact name to look up." }
                  },
                  required: ["nameQuery"]
                }
              },
              {
                name: "placePhoneCall",
                description: "Place a phone call to a given phone number or contact.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    phoneNumber: { type: Type.STRING, description: "Phone number to call." },
                    contactName: { type: Type.STRING, description: "Name of the person being called." }
                  },
                  required: ["phoneNumber"]
                }
              },
              {
                name: "getScreenContext",
                description: "Get the current foreground app package name and visible text/interactive elements on screen.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {}
                }
              },
              {
                name: "typeOnScreen",
                description: "Type text into the currently focused search bar or input field on screen.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING, description: "Text to type into input field." }
                  },
                  required: ["text"]
                }
              },
              {
                name: "clickOnScreen",
                description: "Click a button, search result, or text element currently visible on screen.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    targetText: { type: Type.STRING, description: "Exact or partial text of the button or item to click." }
                  },
                  required: ["targetText"]
                }
              },
              {
                name: "getDeviceTime",
                description: "Get current exact device time, date, and greeting context.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {}
                }
              },
              {
                name: "controlFlashlight",
                description: "Turn the device flashlight ON or OFF.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    enable: { type: Type.BOOLEAN, description: "True to turn on, false to turn off." }
                  },
                  required: ["enable"]
                }
              },
              {
                name: "readNotifications",
                description: "Read incoming messages or notifications from the device.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {}
                }
              },
              {
                name: "replyNotification",
                description: "Reply to an incoming notification message.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    notificationId: { type: Type.STRING, description: "ID of the notification to reply to." },
                    message: { type: Type.STRING, description: "Text content of the reply." }
                  },
                  required: ["notificationId", "message"]
                }
              },
              {
                name: "getBatteryStatus",
                description: "Get the device battery percentage and charging status.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {}
                }
              },
              {
                name: "getLocation",
                description: "Get current GPS coordinates / location of the device.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {}
                }
              },
              {
                name: "sendSms",
                description: "Send an SMS text message to a contact or phone number.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    phoneNumber: { type: Type.STRING, description: "Target phone number" },
                    message: { type: Type.STRING, description: "Text message body" }
                  },
                  required: ["phoneNumber", "message"]
                }
              },
              {
                name: "setAlarm",
                description: "Set a clock alarm on the phone.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    hour: { type: Type.INTEGER, description: "Hour of the alarm (0-23)" },
                    minute: { type: Type.INTEGER, description: "Minute of the alarm (0-59)" },
                    label: { type: Type.STRING, description: "Alarm description or label" }
                  },
                  required: ["hour", "minute"]
                }
              },
              {
                name: "setTimer",
                description: "Set a countdown timer on the phone.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    seconds: { type: Type.INTEGER, description: "Duration in seconds" },
                    label: { type: Type.STRING, description: "Timer description" }
                  },
                  required: ["seconds"]
                }
              },
              {
                name: "controlMedia",
                description: "Control active audio or video media playback (play, pause, next, previous, stop).",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING, description: "Action: 'play', 'pause', 'next', 'previous', 'stop'" }
                  },
                  required: ["action"]
                }
              },
              {
                name: "setVolume",
                description: "Adjust audio volume level on the device.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    streamType: { type: Type.STRING, description: "Stream type: 'media', 'ring', 'alarm', 'notification'" },
                    levelPercent: { type: Type.INTEGER, description: "Volume level percentage (0 to 100)" }
                  },
                  required: ["streamType", "levelPercent"]
                }
              },
              {
                name: "openSettingsScreen",
                description: "Open system settings screens (WIFI, BLUETOOTH, SOUND, DISPLAY, LOCATION, NOTIFICATION, ACCESSIBILITY).",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    settingType: { type: Type.STRING, description: "Settings category name" }
                  },
                  required: ["settingType"]
                }
              },
              {
                name: "takePhoto",
                description: "Open device camera to capture a photo.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {}
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Venom Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            // Handle Transcriptions
            const modelText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelText) {
               this.onMessage("venom", modelText);
               memoryService.saveMemory(modelText, "chat", 1, "venom");
            }

            const userTranscription = (message.serverContent as any)?.userTurn?.parts?.[0]?.text;
            if (userTranscription) {
               this.onMessage("user", userTranscription);
               memoryService.saveMemory(userTranscription, "chat", 1, "user");
            }

            // Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                let executionResult: any = "Executed successfully.";
                const args = call.args as any;

                if (call.name === "executeBrowserAction") {
                  let url = "";
                  if (args.actionType === "youtube") {
                    url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "spotify") {
                    url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "whatsapp") {
                    url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                  } else {
                    let website = args.query.replace(/\s+/g, "");
                    if (!website.includes(".")) website += ".com";
                    url = `https://www.${website}`;
                  }
                  this.onCommand(url);
                  executionResult = { result: `Opened ${url}` };

                } else if (call.name === "openApp") {
                  const res = NativeBridge.openApp(args.appName);
                  executionResult = { result: res.message };

                } else if (call.name === "closeApp") {
                  const res = NativeBridge.closeApp();
                  executionResult = { result: res.message };

                } else if (call.name === "resolveContact") {
                  const isNative = NativeBridge.isAndroidNative();
                  const matches = NativeBridge.resolveContact(args.nameQuery);
                  if (!isNative) {
                    executionResult = {
                      status: "Web Browser Mode",
                      message: "Device address book is not accessible in Web Browser mode. Native Android APK is required.",
                      count: 0,
                      matches: []
                    };
                  } else if (matches.length === 0) {
                    executionResult = {
                      status: "No Matches",
                      message: `No contacts found matching "${args.nameQuery}" in device contacts.`,
                      count: 0,
                      matches: []
                    };
                  } else {
                    executionResult = { matches, count: matches.length };
                  }

                } else if (call.name === "placePhoneCall") {
                  const ok = NativeBridge.callContact(args.phoneNumber);
                  executionResult = { success: ok, result: ok ? `Initiating call to ${args.contactName || args.phoneNumber}` : "Failed to place call." };

                } else if (call.name === "getScreenContext") {
                  const screenCtx = NativeBridge.getScreenContext();
                  executionResult = screenCtx;

                } else if (call.name === "typeOnScreen") {
                  const ok = NativeBridge.typeAccessibilityText(args.text);
                  executionResult = { success: ok, result: ok ? `Typed "${args.text}" into input field.` : "No active input field found on screen." };

                } else if (call.name === "clickOnScreen") {
                  const ok = NativeBridge.clickAccessibilityNode(args.targetText);
                  executionResult = { success: ok, result: ok ? `Clicked "${args.targetText}".` : `Element "${args.targetText}" not found on screen.` };

                } else if (call.name === "getDeviceTime") {
                  const time = new Date().toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  executionResult = { time };

                } else if (call.name === "controlFlashlight") {
                  const res = NativeBridge.toggleFlashlight(args.enable);
                  executionResult = { result: res.message };

                } else if (call.name === "readNotifications") {
                  const isNative = NativeBridge.isAndroidNative();
                  const list = NativeBridge.readNotifications();
                  if (!isNative) {
                    executionResult = {
                      status: "Web Browser Mode",
                      message: "Notification listener requires running inside the installed Android Venom app. No notifications are present in Web View.",
                      count: 0,
                      notifications: []
                    };
                  } else if (list.length === 0) {
                    executionResult = {
                      status: "No Notifications",
                      message: "There are currently zero new or unread system notifications on the device.",
                      count: 0,
                      notifications: []
                    };
                  } else {
                    executionResult = { status: "Success", count: list.length, notifications: list };
                  }

                } else if (call.name === "replyNotification") {
                  const ok = NativeBridge.replyNotification(args.notificationId, args.message);
                  executionResult = { success: ok, result: ok ? "Reply sent!" : "Failed to send reply." };

                } else if (call.name === "getBatteryStatus") {
                  const bat = await NativeBridge.getBatteryStatus();
                  executionResult = { battery: `${bat.level}%`, charging: bat.isCharging };

                } else if (call.name === "getLocation") {
                  const loc = await NativeBridge.getLocation();
                  executionResult = { location: loc || "Location unavailable" };

                } else if (call.name === "sendSms") {
                  const res = NativeBridge.sendSms(args.phoneNumber, args.message);
                  executionResult = { result: res };

                } else if (call.name === "setAlarm") {
                  const res = NativeBridge.setAlarm(args.hour, args.minute, args.label || "VENOM Alarm");
                  executionResult = { result: res };

                } else if (call.name === "setTimer") {
                  const res = NativeBridge.setTimer(args.seconds, args.label || "VENOM Timer");
                  executionResult = { result: res };

                } else if (call.name === "controlMedia") {
                  const res = NativeBridge.controlMedia(args.action);
                  executionResult = { result: res };

                } else if (call.name === "setVolume") {
                  const res = NativeBridge.setVolume(args.streamType, args.levelPercent);
                  executionResult = { result: res };

                } else if (call.name === "openSettingsScreen") {
                  const res = NativeBridge.openSettingsScreen(args.settingType);
                  executionResult = { result: res };

                } else if (call.name === "takePhoto") {
                  const res = NativeBridge.takePhoto();
                  executionResult = { result: res };
                }

                // Send tool response back to Live session
                this.sessionPromise?.then(session => {
                  session.sendToolResponse({
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: executionResult
                    }]
                  });
                }).catch(() => {});
              }
            }
          },
          onclose: () => {
            console.log("Venom Live API Stream Closed - switching to fallback speech engine");
            this.startFallbackSpeechRecognition();
          },
          onerror: (err) => {
            console.warn("Venom Live API Stream connection error, switching to fallback mode:", err);
            this.startFallbackSpeechRecognition();
          }
        }
      });

      livePromise.catch((err) => {
        console.warn("Venom Live API Promise catch:", err);
        this.startFallbackSpeechRecognition();
      });

      this.sessionPromise = livePromise;

    } catch (error: any) {
      console.error("Failed to start Live Session:", error);
      if (error?.message?.includes("Permission denied") || error?.name === "NotAllowedError" || error?.message?.includes("NotAllowedError") || error?.name?.includes("Permission")) {
        this.onMessage("venom", "Microphone access was denied. Please allow microphone permissions, or if you are in the AI Studio preview, open the app in a new tab by clicking the arrow in the top right.");
        this.stop();
        throw error;
      } else {
        console.warn("Live API start failed, attempting speech recognition fallback...");
        this.startFallbackSpeechRecognition();
      }
    }
  }

  private async playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      // Ensure context is resumed (browser safety)
      if (this.playbackContext.state === "suspended") {
        await this.playbackContext.resume();
      }

      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      
      const compressor = this.playbackContext.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-15, this.playbackContext.currentTime);
      compressor.knee.setValueAtTime(25, this.playbackContext.currentTime);
      compressor.ratio.setValueAtTime(10, this.playbackContext.currentTime);
      compressor.attack.setValueAtTime(0.003, this.playbackContext.currentTime);
      compressor.release.setValueAtTime(0.25, this.playbackContext.currentTime);

      const outGain = this.playbackContext.createGain();
      outGain.gain.setValueAtTime(2.0, this.playbackContext.currentTime); // Boost gain to 200% for maximum loudness

      source.connect(compressor);
      compressor.connect(outGain);
      outGain.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime + 0.1) {
        this.nextPlayTime = currentTime + 0.1;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        // Only update state if this was the last chunk in the queue
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.05) {
          this.isPlaying = false;
          this.setState("listening");
          if (this.isFallbackMode && this.speechRecognizer) {
            try { this.speechRecognizer.start(); } catch(e){}
          }
        }
      };
    } catch (e) {
      console.error("Error playing audio chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    this.isFallbackMode = false;
    this.stopScreenShare();

    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.stop();
      } catch(e) {}
      this.speechRecognizer = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();
    
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
    
    this.onStateChange("idle");
  }

  async handleFallbackText(text: string, skipUserMsg = false) {
    if (!text.trim()) return;
    this.onStateChange("processing");
    if (!skipUserMsg) {
      this.onMessage("user", text);
    }
    try {
      const reply = await getVenomResponse(text);
      this.onMessage("venom", reply);
      const audioBase64 = await getVenomAudio(reply);
      if (audioBase64) {
        this.onStateChange("speaking");
        this.playAudioChunk(audioBase64);
      } else {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const synth = window.speechSynthesis;
          const utter = new SpeechSynthesisUtterance(reply);
          utter.onend = () => {
            this.onStateChange("listening");
          };
          this.onStateChange("speaking");
          synth.speak(utter);
          return;
        }
        this.onStateChange("listening");
      }
    } catch (err) {
      console.error("Fallback text handling error:", err);
      this.onMessage("venom", "Sorry, I had trouble processing that request. Please try again!");
      this.onStateChange("listening");
    }
  }

  sendText(text: string) {
    if (this.sessionPromise && !this.isFallbackMode) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      }).catch(() => {
        this.handleFallbackText(text, true);
      });
    } else {
      this.handleFallbackText(text, true);
    }
  }
}

