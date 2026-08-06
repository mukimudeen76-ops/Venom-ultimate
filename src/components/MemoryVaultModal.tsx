import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Database, Brain, Search, Download, Upload, Plus, Trash2, Shield, Sparkles, X, Check, FileText, Lock, Bell, Clock } from "lucide-react";
import { memoryService, UserFact, MemoryItem } from "../services/memoryService";
import { reminderService, ReminderItem } from "../services/reminderService";

interface MemoryVaultModalProps {
  onClose: () => void;
}

export default function MemoryVaultModal({ onClose }: MemoryVaultModalProps) {
  const [activeTab, setActiveTab] = useState<"facts" | "memories" | "reminders" | "backup">("facts");
  const [facts, setFacts] = useState<UserFact[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Add fact form state
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCategory, setNewCategory] = useState("profile");
  const [addSuccess, setAddSuccess] = useState(false);

  // Add reminder form state
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState("5");

  // Import/Export status
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    loadVaultData();
  }, []);

  const loadVaultData = async () => {
    const loadedFacts = await memoryService.getAllFactsFromDB();
    const loadedMems = await memoryService.getAllMemoriesFromDB();
    setFacts(loadedFacts);
    setMemories(loadedMems);
    setReminders(reminderService.getAllReminders());
  };

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTitle.trim()) return;
    const mins = parseFloat(reminderMinutes) || 5;
    reminderService.addReminder(reminderTitle, mins);
    setReminderTitle("");
    setReminders(reminderService.getAllReminders());
  };

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    await memoryService.saveFact(newKey, newValue, newCategory);
    setNewKey("");
    setNewValue("");
    setAddSuccess(true);
    setTimeout(() => setAddSuccess(false), 2000);
    await loadVaultData();
  };

  const handleExport = async () => {
    try {
      const jsonStr = await memoryService.exportMemoryVaultJSON();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `venom_memory_vault_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error exporting memory vault: " + e);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const res = await memoryService.importMemoryVaultJSON(content);
        setImportStatus(`Success! Restored ${res.factsImported} facts, ${res.memoriesImported} memories, ${res.remindersImported || 0} reminders, and system settings.`);
        await loadVaultData();
      } catch (err) {
        setImportStatus("Import failed: Invalid vault JSON file format.");
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = async () => {
    if (confirm("Are you sure you want to clear all long-term memories? This action cannot be undone unless you have a JSON backup.")) {
      await memoryService.clearAllMemories();
      await loadVaultData();
    }
  };

  const filteredMemories = searchQuery
    ? memoryService.searchMemories(searchQuery, 30)
    : memories.slice(-30).reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-2xl bg-[#0b0a14] border border-violet-500/30 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 relative text-white max-h-[90vh] overflow-y-auto scrollbar-hide"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-600/20 border border-violet-500/40 rounded-2xl text-violet-400">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                VENOM Ultimate Memory Vault
                <span className="text-xs font-semibold px-2 py-0.5 bg-violet-500/20 border border-violet-500/40 text-violet-300 rounded-full">
                  Lifetime Storage
                </span>
              </h2>
              <p className="text-xs text-white/50">
                Persistent multi-year knowledge base stored across IndexedDB & local backups
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Storage Stats Bar */}
        <div className="grid grid-cols-3 gap-3 p-3 bg-white/[0.03] border border-white/10 rounded-2xl text-center">
          <div>
            <div className="text-xs text-white/50">Permanent Facts</div>
            <div className="text-lg font-bold text-violet-400">{facts.length}</div>
          </div>
          <div>
            <div className="text-xs text-white/50">Recorded Events</div>
            <div className="text-lg font-bold text-purple-400">{memories.length}</div>
          </div>
          <div>
            <div className="text-xs text-white/50">Retention Span</div>
            <div className="text-lg font-bold text-emerald-400 flex items-center justify-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Permanent
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("facts")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === "facts" ? "bg-violet-600 text-white shadow-lg" : "text-white/60 hover:text-white"
            }`}
          >
            <Database className="w-3.5 h-3.5" /> Facts ({facts.length})
          </button>
          <button
            onClick={() => setActiveTab("reminders")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === "reminders" ? "bg-violet-600 text-white shadow-lg" : "text-white/60 hover:text-white"
            }`}
          >
            <Bell className="w-3.5 h-3.5" /> Timers/Alarms ({reminders.filter(r => r.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab("memories")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === "memories" ? "bg-violet-600 text-white shadow-lg" : "text-white/60 hover:text-white"
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Memory Log ({memories.length})
          </button>
          <button
            onClick={() => setActiveTab("backup")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === "backup" ? "bg-violet-600 text-white shadow-lg" : "text-white/60 hover:text-white"
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> Backup
          </button>
        </div>

        {/* Tab 1: Permanent Facts */}
        {activeTab === "facts" && (
          <div className="flex flex-col gap-5">
            {/* Add Fact Form */}
            <form onSubmit={handleAddFact} className="flex flex-col gap-3 p-4 bg-violet-950/20 border border-violet-500/30 rounded-2xl">
              <div className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Add Permanent Fact or User Preference
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Key (e.g. Name, Favorite Food, Birthday)"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-violet-500"
                />
                <input
                  type="text"
                  placeholder="Value (e.g. Farhan, Biryani, Nov 15)"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-violet-500"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white/80 focus:outline-none"
                >
                  <option value="profile">Profile Info</option>
                  <option value="preferences">Preferences</option>
                  <option value="work">Work / Projects</option>
                  <option value="general">General Knowledge</option>
                </select>

                <button
                  type="submit"
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all shadow-md"
                >
                  {addSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
                  Save to Vault
                </button>
              </div>
            </form>

            {/* List of Facts */}
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto scrollbar-hide">
              {facts.length === 0 ? (
                <div className="text-center py-8 text-white/40 text-xs">
                  No facts recorded yet. Speak with VENOM or add facts above!
                </div>
              ) : (
                facts.map((fact) => (
                  <div key={fact.id} className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/10 rounded-2xl">
                    <div>
                      <div className="text-xs font-semibold text-violet-300">{fact.key}</div>
                      <div className="text-sm font-medium text-white">{fact.value}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-white/50 capitalize">
                      {fact.category}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab: Scheduled Reminders & Alarms */}
        {activeTab === "reminders" && (
          <div className="flex flex-col gap-5">
            <form onSubmit={handleAddReminder} className="flex flex-col gap-3 p-4 bg-cyan-950/20 border border-cyan-500/30 rounded-2xl">
              <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Schedule Real Timer / Alarm Reminder
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Task / Note (e.g. Going to Market, Take Medicine)"
                  value={reminderTitle}
                  onChange={(e) => setReminderTitle(e.target.value)}
                  className="sm:col-span-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="number"
                  placeholder="Delay in mins (e.g. 5)"
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Bell className="w-4 h-4" /> Start Alarm Timer
                </button>
              </div>
            </form>

            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto scrollbar-hide">
              {reminders.length === 0 ? (
                <div className="text-center py-8 text-white/40 text-xs">
                  No active timers or reminders. Ask Venom e.g. "5 min ka timer set kar do" or add one above!
                </div>
              ) : (
                reminders.slice().reverse().map((rem) => {
                  const isPending = rem.status === "pending";
                  const timeLeftSec = Math.max(0, Math.round((rem.targetTime - Date.now()) / 1000));
                  const mins = Math.floor(timeLeftSec / 60);
                  const secs = timeLeftSec % 60;

                  return (
                    <div key={rem.id} className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/10 rounded-2xl">
                      <div>
                        <div className="text-xs font-semibold text-cyan-300">{rem.title}</div>
                        <div className="text-[11px] text-white/60 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-white/40" />
                          Target: {new Date(rem.targetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isPending && (
                            <span className="text-emerald-400 font-bold ml-2">
                              ({mins}m {secs}s remaining)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${
                          isPending ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse" : "bg-white/10 text-white/40"
                        }`}>
                          {rem.status}
                        </span>
                        <button
                          onClick={() => {
                            reminderService.dismissReminder(rem.id);
                            setReminders(reminderService.getAllReminders());
                          }}
                          className="p-1 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Memory Log & Search */}
        {activeTab === "memories" && (
          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-white/40" />
              <input
                type="text"
                placeholder="Search across all historical memories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-9 pr-4 py-2.5 text-xs focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* Memory Items list */}
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto scrollbar-hide">
              {filteredMemories.length === 0 ? (
                <div className="text-center py-8 text-white/40 text-xs">
                  No memories matched your search.
                </div>
              ) : (
                filteredMemories.map((mem) => (
                  <div key={mem.id} className="p-3 bg-white/[0.03] border border-white/10 rounded-2xl flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] text-white/40">
                      <span className="font-semibold text-violet-400 capitalize">{mem.sender || "system"}</span>
                      <span>{mem.dateFormatted}</span>
                    </div>
                    <p className="text-xs text-white/90 leading-relaxed">{mem.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Vault Backup & Restore */}
        {activeTab === "backup" && (
          <div className="flex flex-col gap-5">
            <div className="p-4 bg-violet-950/30 border border-violet-500/30 rounded-2xl flex flex-col gap-2">
              <h3 className="text-sm font-bold text-violet-300 flex items-center gap-2">
                <Download className="w-4 h-4" /> Export Memory Vault
              </h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Download a complete offline JSON backup of all your permanent facts, user profile knowledge, and chat event logs. You can restore this backup on any device or after clearing browser history.
              </p>
              <button
                onClick={handleExport}
                className="mt-2 w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <Download className="w-4 h-4" /> Download Vault JSON Backup
              </button>
            </div>

            <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex flex-col gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4" /> Restore Memory Vault
              </h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Upload an existing VENOM memory vault JSON file to restore all permanent facts and logs into local memory.
              </p>
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="block w-full text-xs text-white/70 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-violet-600 file:text-white hover:file:bg-violet-500 cursor-pointer"
              />
              {importStatus && (
                <div className="text-xs text-emerald-400 mt-2 font-medium">{importStatus}</div>
              )}
            </div>

            <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-red-400">Clear All Memories</div>
                <div className="text-[11px] text-white/50">Permanently reset memory database.</div>
              </div>
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 bg-red-600/30 hover:bg-red-600/50 border border-red-500/50 text-red-300 rounded-xl text-xs font-medium flex items-center gap-1 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" /> Wipe Vault
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/50">
          <span className="flex items-center gap-1.5 text-violet-400">
            <Sparkles className="w-4 h-4" /> Powered by VENOM Persistent Vault Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
