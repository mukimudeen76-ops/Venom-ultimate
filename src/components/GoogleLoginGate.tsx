import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { NativeBridge } from "../services/nativeBridge";
import { firebaseEnabled, auth, googleProvider } from "../lib/firebase";
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";

interface Props {
  onDone: () => void;
}

/**
 * Google Login Gate — app kholte hi dikhta hai (venom-ultimate jaisa).
 * - Firebase configured hai to "Sign in with Google" / "Guest mode" option.
 * - Firebase nahi hai to turant guest mode (app block nahi hota).
 * WebView me popup block ho to bhi guest mode milta hai — app kabhi atakta nahi.
 */
export default function GoogleLoginGate({ onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"loading" | "choose">("loading");

  useEffect(() => {
    if (!firebaseEnabled || !auth || !googleProvider) {
      onDone(); // firebase off -> guest
      return;
    }
    // Pehle guest choose kiya tha to phir login mat dikhao
    try {
      if (localStorage.getItem("venom_guest") === "1") { onDone(); return; }
    } catch (e) { /* ignore */ }

    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; fn(); } };

    const unsub = onAuthStateChanged(auth, (u: any) => {
      if (u) {
        try { localStorage.setItem("venom_user", u.email || u.uid || ""); } catch (e) {}
        finish(onDone);
      } else {
        finish(() => setMode("choose"));
      }
    });

    // Android: WebView me popup block hota hai — Google button browser me
    // sign-in kholta hai (fir wapas aake guest continue). Auto-guest sirf 6s
    // ke baad agar auth hang rahe (app kabhi atakta nahi).
    if (NativeBridge.isAndroidNative()) {
      const autoGuest = setTimeout(() => {
        try { localStorage.setItem("venom_guest", "1"); } catch (e) {}
        finish(onDone);
      }, 6000);
      return () => {
        try { unsub(); } catch (e) {}
        clearTimeout(timeout);
        clearTimeout(autoGuest);
      };
    }

    // BLACK-SCREEN FIX: Firebase auth WebView me hang ho (onAuthStateChanged
    // kabhi na fire) to 2.5s me "choose" screen dikhao — loading pe kabhi na atko.
    const timeout = setTimeout(() => {
      finish(() => setMode("choose"));
    }, 2500);

    return () => {
      try { unsub(); } catch (e) {}
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async () => {
    // Android WebView: popup block rehta hai -> external browser me sign-in kholo
    // (wahan Google sign-in pura chalta hai). Wapas aakar Guest continue karo.
    if (NativeBridge.isAndroidNative()) {
      setError("Android app me Google sign-in external browser me hota hai. Browser me sign-in karke wapas aao, phir Guest se continue karo. (Web/Desktop version me yahan hi sign-in hota hai.)");
      try {
        const url = window.location.href.split("#")[0];
        (window as any).AndroidBridge?.openBrowser?.(url + "?google=1");
      } catch (e) {}
      return;
    }
    setBusy(true); setError("");
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const u: any = cred?.user;
      if (u) {
        try { localStorage.setItem("venom_user", u.email || u.uid || ""); } catch (e) {}
      }
      onDone();
    } catch (e: any) {
      const code = e?.code || "";
      if (code.includes("popup") || code.includes("cancelled") || code.includes("not-allowed")) {
        setError("Google popup is WebView me block ho gaya. 'Guest mode' chuno ya app browser me kholo.");
      } else {
        setError(e?.message || "Sign-in fail ho gaya. Guest mode chuno.");
      }
    } finally {
      setBusy(false);
    }
  };

  const guest = () => {
    try { localStorage.setItem("venom_guest", "1"); } catch (e) {}
    onDone();
  };

  if (mode === "loading") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#02080b]">
        <motion.div
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-400 via-violet-500 to-pink-500 shadow-[0_0_40px_rgba(139,92,246,0.6)]"
        />
        <p className="mt-6 text-cyan-300 font-mono text-sm animate-pulse">VENOM loading...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#02080b] p-6 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl border border-violet-500/30 bg-[#0a0a10]/97 shadow-2xl p-8 text-center"
      >
        <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-400 via-violet-500 to-pink-500 shadow-[0_0_30px_rgba(139,92,246,0.5)] flex items-center justify-center">
          <ShieldCheck className="text-white" size={30} />
        </div>

        <h2 className="text-2xl font-serif font-bold tracking-wide bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
          WELCOME TO VENOM
        </h2>
        <p className="text-sm text-white/60 mt-2 font-mono">
          {NativeBridge.isAndroidNative() ? "Android Assistant" : "Desktop Assistant"} — apna control room
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <button
            onClick={signIn}
            disabled={busy}
            className="flex items-center justify-center gap-3 w-full py-3 rounded-2xl bg-white text-[#111] font-bold text-sm hover:bg-white/90 disabled:opacity-50 transition-all"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : (
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
              </svg>
            )}
            {busy ? "Signing in..." : "Sign in with Google"}
          </button>

          <button
            onClick={guest}
            disabled={busy}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white/80 text-sm font-semibold hover:bg-white/10 disabled:opacity-50 transition-all"
          >
            <X size={16} /> Continue as Guest
          </button>
        </div>

        {error && (
          <p className="mt-4 text-[11px] text-amber-300 font-mono bg-amber-950/30 border border-amber-500/30 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <p className="mt-6 text-[10px] text-white/30 font-mono">
          VENOM by Boss Tehzeeb · Memory & settings device pe save hote hain
        </p>
      </motion.div>
    </div>
  );
}
