// Ultimate Long-Term Memory Engine for VENOM
// Persistent Storage using IndexedDB + LocalStorage Sync with Backup Export/Import capability

export interface MemoryItem {
  id: string;
  timestamp: number;
  dateFormatted: string;
  category: "chat" | "fact" | "preference" | "event" | "summary";
  text: string;
  sender?: "user" | "venom";
  keywords: string[];
  importance: number; // 1 to 5
}

export interface UserFact {
  id: string;
  key: string;
  value: string;
  category: string;
  updatedAt: number;
}

const DB_NAME = "VenomUltimateMemoryDB";
const DB_VERSION = 1;

class MemoryService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryCache: MemoryItem[] = [];
  private factsCache: UserFact[] = [];
  private isInitialized = false;

  constructor() {
    if (typeof window !== "undefined") {
      // 1. Instant sync load from localStorage on bootup to avoid async delay
      this.factsCache = this.getFactsFromLocalStorage();
      this.memoryCache = this.getMemoriesFromLocalStorage();

      // 2. Load from IndexedDB and merge
      this.initDB().then(() => {
        this.loadCaches();
      });
    }
  }

  private initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn("IndexedDB not available, fallback to localStorage");
        reject("IndexedDB unavailable");
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("memories")) {
          const memStore = db.createObjectStore("memories", { keyPath: "id" });
          memStore.createIndex("timestamp", "timestamp", { unique: false });
          memStore.createIndex("category", "category", { unique: false });
        }
        if (!db.objectStoreNames.contains("facts")) {
          const factStore = db.createObjectStore("facts", { keyPath: "id" });
          factStore.createIndex("key", "key", { unique: false });
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        this.isInitialized = true;
        resolve(this.db!);
      };

      request.onerror = (event: any) => {
        console.error("IndexedDB initialization error:", event.target.error);
        reject(event.target.error);
      };
    });

    return this.dbPromise;
  }

  private async loadCaches() {
    try {
      const dbFacts = await this.getAllFactsFromDB();
      const dbMemories = await this.getAllMemoriesFromDB();

      // Merge facts safely (don't overwrite with empty)
      const factMap = new Map<string, UserFact>();
      for (const f of this.factsCache) {
        if (f.id && f.key) factMap.set(f.id, f);
      }
      for (const f of dbFacts) {
        if (f.id && f.key) {
          const existing = factMap.get(f.id);
          if (!existing || f.updatedAt >= existing.updatedAt) {
            factMap.set(f.id, f);
          }
        }
      }
      this.factsCache = Array.from(factMap.values());

      // Merge memories safely
      const memMap = new Map<string, MemoryItem>();
      for (const m of this.memoryCache) {
        if (m.id && m.text) memMap.set(m.id, m);
      }
      for (const m of dbMemories) {
        if (m.id && m.text) memMap.set(m.id, m);
      }
      this.memoryCache = Array.from(memMap.values()).sort((a, b) => a.timestamp - b.timestamp);

      this.syncToLocalStorage();
    } catch (e) {
      console.error("Error loading memory caches:", e);
    }
  }

  private syncToLocalStorage() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem("venom_permanent_facts", JSON.stringify(this.factsCache));
      localStorage.setItem("venom_permanent_memories", JSON.stringify(this.memoryCache.slice(-300)));
      localStorage.setItem("venom_memory_count", String(this.memoryCache.length));
    } catch (e) {
      // localStorage quota safeguard
    }
  }

  getMemoriesFromLocalStorage(): MemoryItem[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem("venom_permanent_memories");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // --- FACTS STORAGE ---
  async saveFact(key: string, value: string, category = "general"): Promise<UserFact> {
    const factId = `fact_${key.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const fact: UserFact = {
      id: factId,
      key: key.trim(),
      value: value.trim(),
      category,
      updatedAt: Date.now(),
    };

    const existingIdx = this.factsCache.findIndex((f) => f.id === factId || f.key.toLowerCase() === key.toLowerCase());
    if (existingIdx >= 0) {
      this.factsCache[existingIdx] = fact;
    } else {
      this.factsCache.push(fact);
    }

    this.syncToLocalStorage();

    try {
      const db = await this.initDB();
      const tx = db.transaction("facts", "readwrite");
      const store = tx.objectStore("facts");
      store.put(fact);
    } catch (e) {
      console.warn("Could not save fact to IndexedDB:", e);
    }

    return fact;
  }

  async deleteFact(key: string): Promise<boolean> {
    const factId = `fact_${key.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    this.factsCache = this.factsCache.filter((f) => f.id !== factId && f.key.toLowerCase() !== key.toLowerCase());
    this.syncToLocalStorage();

    try {
      const db = await this.initDB();
      const tx = db.transaction("facts", "readwrite");
      const store = tx.objectStore("facts");
      store.delete(factId);
      return true;
    } catch (e) {
      console.warn("Could not delete fact from IndexedDB:", e);
      return false;
    }
  }

  async getAllFactsFromDB(): Promise<UserFact[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const tx = db.transaction("facts", "readonly");
        const store = tx.objectStore("facts");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(this.getFactsFromLocalStorage());
      });
    } catch (e) {
      return this.getFactsFromLocalStorage();
    }
  }

  getFactsFromLocalStorage(): UserFact[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem("venom_permanent_facts");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  getFactsSync(): UserFact[] {
    if (this.factsCache.length > 0) return this.factsCache;
    return this.getFactsFromLocalStorage();
  }

  // --- MEMORY ITEMS STORAGE ---
  async saveMemory(
    text: string,
    category: "chat" | "fact" | "preference" | "event" | "summary" = "chat",
    importance = 1,
    sender?: "user" | "venom",
    keywords: string[] = []
  ): Promise<MemoryItem> {
    if (!text || text.trim().length === 0) return null as any;

    const now = new Date();
    const memory: MemoryItem = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: now.getTime(),
      dateFormatted: now.toLocaleString(),
      category,
      text: text.trim(),
      sender,
      keywords: keywords.length > 0 ? keywords : this.extractKeywords(text),
      importance,
    };

    this.memoryCache.push(memory);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("venom_memory_count", String(this.memoryCache.length));
    }

    try {
      const db = await this.initDB();
      const tx = db.transaction("memories", "readwrite");
      const store = tx.objectStore("memories");
      store.put(memory);
    } catch (e) {
      console.warn("IndexedDB save memory error:", e);
    }

    // Auto extract user profile facts if user statement
    if (sender === "user" || category === "chat") {
      this.extractAndSaveFacts(text);
    }

    return memory;
  }

  async getAllMemoriesFromDB(): Promise<MemoryItem[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const tx = db.transaction("memories", "readonly");
        const store = tx.objectStore("memories");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  }

  getMemoriesSync(): MemoryItem[] {
    return this.memoryCache;
  }

  // --- AUTOMATIC FACT EXTRACTION ---
  private extractAndSaveFacts(text: string) {
    const lower = text.toLowerCase();

    // Comprehensive Name extraction (English, Hindi, Hinglish)
    const nameMatch = text.match(/(?:my name is|i am|call me|mera naam|naam hai|mujhe|iam)\s+([A-Za-z0-9_-]+)/i);
    if (nameMatch && nameMatch[1]) {
      const name = nameMatch[1];
      if (!["a", "the", "an", "not", "going", "very", "bhi", "yeh", "kya", "kaise", "raha", "kar"].includes(name.toLowerCase())) {
        this.saveFact("User Name", name, "profile");
      }
    }

    // Direct name declaration like "mera naam Farhan hai" or "Main Farhan hoon"
    const directNameMatch = text.match(/(?:mera naam|my name)\s+([A-Za-z0-9_-]+)\s*(?:hai|hun|hoon|is)/i) ||
                             text.match(/(?:main|i am|iam)\s+([A-Za-z0-9_-]+)\s*(?:hoon|hun|hai)/i);
    if (directNameMatch && directNameMatch[1]) {
      const name = directNameMatch[1];
      if (!["a", "the", "an", "not", "going", "very", "bhi", "yeh", "kya", "kaise"].includes(name.toLowerCase())) {
        this.saveFact("User Name", name, "profile");
      }
    }

    // Remember / Note request extraction (e.g. "remember that...", "yaad rakhna...", "note kar lo...")
    const rememberMatch = text.match(/(?:remember that|remember|yaad rakhna|yaad rakho|note kar lo|note text|dhyan rakhna)\s+(.+)/i);
    if (rememberMatch && rememberMatch[1]) {
      this.saveFact(`Note (${new Date().toLocaleDateString()})`, rememberMatch[1].trim(), "important_notes");
    }

    // Favorite/Likes
    const likeMatch = text.match(/(?:i love|i like|my favorite|mujhe pasand hai|pasaand hai)\s+([^.,!?\n]+)/i);
    if (likeMatch && likeMatch[1]) {
      this.saveFact("Preference", likeMatch[1].trim(), "preferences");
    }

    // Language / Communication preference
    if (lower.includes("speak hindi") || lower.includes("hindi me") || lower.includes("hinglish") || lower.includes("urdu")) {
      this.saveFact("Preferred Language", "Hinglish / Hindi", "preferences");
    }

    // Location / City
    const locMatch = text.match(/(?:i live in|i am from|rehta hoon|rehti hoon|rehta hu|se hoon)\s+([^.,!?\n]+)/i);
    if (locMatch && locMatch[1]) {
      this.saveFact("User Location", locMatch[1].trim(), "profile");
    }

    // Occupation / Project
    const projMatch = text.match(/(?:i am working on|my project is|mera project|kaam karta hoon)\s+([^.,!?\n]+)/i);
    if (projMatch && projMatch[1]) {
      this.saveFact("Current Project", projMatch[1].trim(), "work");
    }
  }

  private extractKeywords(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return Array.from(new Set(words)).slice(0, 8);
  }

  // --- MEMORY SEARCH & CONTEXT GENERATION ---
  searchMemories(query: string, limit = 10): MemoryItem[] {
    if (!query || !query.trim()) {
      return this.memoryCache.slice(-limit);
    }

    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (queryWords.length === 0) return this.memoryCache.slice(-limit);

    const scored = this.memoryCache.map((mem) => {
      let score = 0;
      const memTextLower = mem.text.toLowerCase();
      queryWords.forEach((word) => {
        if (memTextLower.includes(word)) score += 3;
        if (mem.keywords.some((k) => k.includes(word))) score += 2;
      });
      if (mem.importance > 1) score += mem.importance;
      return { mem, score };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.mem.timestamp - a.mem.timestamp)
      .slice(0, limit)
      .map((item) => item.mem);
  }

  getFormattedMemoryContext(currentQuery?: string): string {
    const facts = this.getFactsSync();
    let contextParts: string[] = [];

    // 1. Permanent User Facts Block
    if (facts.length > 0) {
      const factLines = facts.map((f) => `- ${f.key}: ${f.value}`).join("\n");
      contextParts.push(`PERMANENT USER KNOWLEDGE VAULT:\n${factLines}`);
    }

    // 2. Total memories metric
    const totalCount = this.memoryCache.length;
    if (totalCount > 0) {
      contextParts.push(`PERMANENT MEMORY VAULT CAPACITY: ${totalCount} recorded events stored forever.`);
    }

    // 3. Relevant search memories
    if (currentQuery) {
      const relevantMems = this.searchMemories(currentQuery, 5);
      if (relevantMems.length > 0) {
        const memLines = relevantMems
          .map((m) => `[${m.dateFormatted}] (${m.sender || "log"}): ${m.text}`)
          .join("\n");
        contextParts.push(`RELEVANT PAST MEMORIES RECALLED FOR CURRENT TOPIC:\n${memLines}`);
      }
    }

    // 4. Lifetime recent key milestones/memories
    const recentImportant = this.memoryCache
      .filter((m) => m.importance >= 2 || m.category === "event" || m.category === "fact")
      .slice(-6);
    if (recentImportant.length > 0) {
      const recentLines = recentImportant.map((m) => `[${m.dateFormatted}]: ${m.text}`).join("\n");
      contextParts.push(`KEY HIGHLIGHTS FROM PAST CONVERSATIONS:\n${recentLines}`);
    }

    return contextParts.join("\n\n");
  }

  // --- EXPORT & IMPORT (Vault & Full System Backup) ---
  async exportMemoryVaultJSON(): Promise<string> {
    const facts = await this.getAllFactsFromDB();
    const memories = await this.getAllMemoriesFromDB();

    let permissions = {};
    let reminders = [];
    try {
      const permRaw = localStorage.getItem("venom_permission_states");
      if (permRaw) permissions = JSON.parse(permRaw);

      const remRaw = localStorage.getItem("venom_scheduled_reminders");
      if (remRaw) reminders = JSON.parse(remRaw);
    } catch (e) {
      console.warn("Error getting local storage for backup:", e);
    }

    const settings = {
      voiceName: localStorage.getItem("gemini_voice_name") || "Puck",
      wakeWordEnabled: localStorage.getItem("venom_wake_word_enabled") !== "false",
      clapWakeEnabled: localStorage.getItem("venom_clap_wake_enabled") !== "false",
    };

    const vaultData = {
      app: "VENOM AI Assistant",
      version: "2.1.0",
      exportDate: new Date().toISOString(),
      stats: {
        totalFacts: facts.length,
        totalMemories: memories.length,
        totalReminders: reminders.length,
      },
      settings,
      permissions,
      reminders,
      facts,
      memories,
    };

    return JSON.stringify(vaultData, null, 2);
  }

  async importMemoryVaultJSON(jsonString: string): Promise<{ factsImported: number; memoriesImported: number; remindersImported: number }> {
    const data = JSON.parse(jsonString);
    if (!data || (!data.facts && !data.memories && !data.settings)) {
      throw new Error("Invalid VENOM backup file format");
    }

    let factsCount = 0;
    let memsCount = 0;
    let remsCount = 0;

    // Restore Settings if present
    if (data.settings) {
      if (data.settings.voiceName) {
        localStorage.setItem("gemini_voice_name", data.settings.voiceName);
      }
      if (typeof data.settings.wakeWordEnabled === "boolean") {
        localStorage.setItem("venom_wake_word_enabled", String(data.settings.wakeWordEnabled));
      }
      if (typeof data.settings.clapWakeEnabled === "boolean") {
        localStorage.setItem("venom_clap_wake_enabled", String(data.settings.clapWakeEnabled));
      }
    }

    // Restore Permissions if present
    if (data.permissions && typeof data.permissions === "object") {
      localStorage.setItem("venom_permission_states", JSON.stringify(data.permissions));
    }

    // Restore Reminders if present
    if (Array.isArray(data.reminders)) {
      localStorage.setItem("venom_scheduled_reminders", JSON.stringify(data.reminders));
      remsCount = data.reminders.length;
    }

    // Restore Facts
    if (Array.isArray(data.facts)) {
      for (const fact of data.facts) {
        if (fact.key && fact.value) {
          await this.saveFact(fact.key, fact.value, fact.category || "imported");
          factsCount++;
        }
      }
    }

    // Restore Memories
    if (Array.isArray(data.memories)) {
      for (const mem of data.memories) {
        if (mem.text) {
          await this.saveMemory(mem.text, mem.category || "chat", mem.importance || 1, mem.sender, mem.keywords);
          memsCount++;
        }
      }
    }

    await this.loadCaches();
    return { factsImported: factsCount, memoriesImported: memsCount, remindersImported: remsCount };
  }

  async clearAllMemories() {
    this.memoryCache = [];
    this.factsCache = [];
    this.syncToLocalStorage();

    try {
      const db = await this.initDB();
      const tx1 = db.transaction("memories", "readwrite");
      tx1.objectStore("memories").clear();
      const tx2 = db.transaction("facts", "readwrite");
      tx2.objectStore("facts").clear();
    } catch (e) {
      console.warn("Clear DB error:", e);
    }
  }
}

export const memoryService = new MemoryService();
