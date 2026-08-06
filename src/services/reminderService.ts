export interface ReminderItem {
  id: string;
  title: string;
  targetTime: number; // timestamp in ms
  formattedTarget: string;
  status: 'pending' | 'fired' | 'dismissed';
  createdAt: number;
}

type ReminderListener = (reminder: ReminderItem) => void;

class ReminderService {
  private reminders: ReminderItem[] = [];
  private listeners: ReminderListener[] = [];
  private checkInterval: any = null;
  private audioCtx: AudioContext | null = null;

  constructor() {
    this.loadReminders();
    this.startEngine();
  }

  private loadReminders() {
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem("venom_scheduled_reminders");
        if (raw) {
          this.reminders = JSON.parse(raw);
        }
      } catch (e) {
        console.error("Error loading reminders:", e);
      }
    }
  }

  private saveReminders() {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("venom_scheduled_reminders", JSON.stringify(this.reminders));
      } catch (e) {
        console.error("Error saving reminders:", e);
      }
    }
  }

  public subscribe(listener: ReminderListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public startEngine() {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => {
      this.checkPendingReminders();
    }, 1000);
  }

  private checkPendingReminders() {
    const now = Date.now();
    for (const item of this.reminders) {
      if (item.status === 'pending' && now >= item.targetTime) {
        item.status = 'fired';
        this.saveReminders();
        this.triggerAlarm(item);
      }
    }
  }

  private triggerAlarm(item: ReminderItem) {
    // 1. Play real Web Audio API alarm sound ring
    this.playAlarmBeep();

    // 2. Speak out loud via browser speech synthesis or TTS
    const speechText = `Dhyan dijiye! Aapka reminder alarm hai: ${item.title}. Time ho gaya hai!`;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.lang = "hi-IN"; // Hindi/Hinglish priority
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn("Speech synthesis error:", e);
      }
    }

    // 3. Notify subscribers (UI popup modal)
    this.listeners.forEach(l => l(item));
  }

  public playAlarmBeep() {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }

      if (this.audioCtx) {
        const now = this.audioCtx.currentTime;
        
        // Ring sequence
        [0, 0.25, 0.5, 0.75, 1.2, 1.45, 1.7].forEach((delay) => {
          const osc = this.audioCtx!.createOscillator();
          const gain = this.audioCtx!.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(880, now + delay); // A5 note
          osc.frequency.exponentialRampToValueAtTime(1200, now + delay + 0.15);

          gain.gain.setValueAtTime(0.3, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.18);

          osc.connect(gain);
          gain.connect(this.audioCtx!.destination);

          osc.start(now + delay);
          osc.stop(now + delay + 0.2);
        });
      }
    } catch (e) {
      console.warn("Could not play alarm sound:", e);
    }
  }

  public addReminder(title: string, delayMinutesOrTimestamp: number | Date, formattedTarget?: string): ReminderItem {
    let targetTime = 0;
    let targetFormatted = formattedTarget || "";

    if (typeof delayMinutesOrTimestamp === "number") {
      targetTime = Date.now() + delayMinutesOrTimestamp * 60 * 1000;
      targetFormatted = `${delayMinutesOrTimestamp} minute(s)`;
    } else {
      targetTime = delayMinutesOrTimestamp.getTime();
      targetFormatted = delayMinutesOrTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const newItem: ReminderItem = {
      id: `rem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      targetTime,
      formattedTarget: targetFormatted,
      status: 'pending',
      createdAt: Date.now()
    };

    this.reminders.push(newItem);
    this.saveReminders();
    return newItem;
  }

  public dismissReminder(id: string) {
    this.reminders = this.reminders.map(r => r.id === id ? { ...r, status: 'dismissed' } : r);
    this.saveReminders();
  }

  public snoozeReminder(id: string, snoozeMinutes = 5) {
    const item = this.reminders.find(r => r.id === id);
    if (item) {
      item.status = 'pending';
      item.targetTime = Date.now() + snoozeMinutes * 60 * 1000;
      item.formattedTarget = `Snoozed +${snoozeMinutes} mins`;
      this.saveReminders();
    }
  }

  public getPendingReminders(): ReminderItem[] {
    return this.reminders.filter(r => r.status === 'pending');
  }

  public getAllReminders(): ReminderItem[] {
    return this.reminders;
  }

  public clearAll() {
    this.reminders = [];
    this.saveReminders();
  }

  /**
   * Helper to parse natural language timer & reminder commands
   */
  public parseNaturalCommand(text: string): { isReminder: boolean; reply?: string; item?: ReminderItem } {
    const lower = text.toLowerCase().trim();

    // Regex for timer/reminder in minutes / seconds / hours
    // e.g. "timer 5 min", "timer set kar do 10 minute ka", "remind me in 15 minutes to take medicine"
    const minMatch = lower.match(/(?:timer|reminder|alarm|remind me|yaad dilana|set timer|set reminder)\s*(?:set kar do|bhi)?\s*(?:for|in|ka)?\s*(\d+)\s*(mins?|minutes?|min|sec|seconds?|hrs?|hours?)\s*(?:to|for|ki|ka)?\s*(.*)/i) ||
                     lower.match(/(\d+)\s*(mins?|minutes?|min|sec|seconds?|hrs?|hours?)\s*(?:ka|baad|after)?\s*(?:timer|reminder|yaad dilana|baad bata dena)\s*(?:ki|ka)?\s*(.*)/i);

    if (minMatch) {
      const num = parseInt(minMatch[1], 10);
      const unit = minMatch[2].toLowerCase();
      let title = minMatch[3] ? minMatch[3].trim() : "Scheduled Task / Reminder";

      if (!title || title.length < 2) {
        title = "Timer Alarm";
      }

      let delayMinutes = num;
      if (unit.startsWith("sec")) {
        delayMinutes = num / 60;
      } else if (unit.startsWith("hr") || unit.startsWith("hour")) {
        delayMinutes = num * 60;
      }

      const item = this.addReminder(title, delayMinutes, `${num} ${unit}`);
      const targetTimeString = new Date(item.targetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      return {
        isReminder: true,
        item,
        reply: `Done! Maine ${title} ka reminder/timer set kar diya hai. Correct ${targetTimeString} par main screen par aakar loud voice aur alarm se aapko bata dunga.`
      };
    }

    // Regex for specific time like "5 baje", "5:30 pm", "at 6:00"
    // e.g. "5 baje mujhe bata dena main market jaane wala hu"
    const clockMatch = lower.match(/(?:at|ko|baje)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:mujhe|bata|yaad|remind)?\s*(.*)/i) ||
                       lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:par|baje|pe)?\s*(.*)/i);

    if (clockMatch && (lower.includes("baje") || lower.includes("alarm") || lower.includes("reminder") || lower.includes("timer") || lower.includes("yaad"))) {
      let hours = parseInt(clockMatch[1], 10);
      const minutes = clockMatch[2] ? parseInt(clockMatch[2], 10) : 0;
      const ampm = clockMatch[3] ? clockMatch[3].toLowerCase() : null;
      let title = clockMatch[4] ? clockMatch[4].trim() : "Scheduled Alarm";

      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;

      // Handle "5 baje" without am/pm -> default to upcoming 5:00
      const now = new Date();
      const targetDate = new Date();
      targetDate.setHours(hours, minutes, 0, 0);

      if (targetDate.getTime() <= now.getTime()) {
        // If time today already passed, schedule for next occurrence or pm if 12hr format ambiguity
        if (!ampm && hours < 12) {
          targetDate.setHours(hours + 12, minutes, 0, 0);
        }
        if (targetDate.getTime() <= now.getTime()) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
      }

      if (!title || title.length < 2) {
        title = "Scheduled Task";
      }

      const item = this.addReminder(title, targetDate);
      const timeStr = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return {
        isReminder: true,
        item,
        reply: `Done! Maine ${timeStr} baje ke liye "${title}" ka alarm/reminder set kar diya hai. Correct time par main screen par alert de dunga!`
      };
    }

    return { isReminder: false };
  }
}

export const reminderService = new ReminderService();
