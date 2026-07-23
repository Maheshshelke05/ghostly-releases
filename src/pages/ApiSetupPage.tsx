import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store/useStore";
import { NVIDIA_MODELS } from "../lib/ai/nvidia";
import { OPENROUTER_FREE_MODELS } from "../lib/ai/openrouter";

const AI_PROVIDERS = [
  {
    id: "groq", label: "Groq", icon: "⚡", badge: "FAST", badgeColor: "rgba(139,92,246,0.15)", badgeBorder: "rgba(139,92,246,0.3)", badgeText: "#a78bfa",
    url: "https://console.groq.com/keys", ph: "gsk_…",
    models: ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    modelLabels: { "meta-llama/llama-4-scout-17b-16e-instruct": "Llama 4 Scout — FREE + VISION", "llama-3.3-70b-versatile": "Llama 3.3 70B — FREE + FAST", "llama-3.1-8b-instant": "Llama 3.1 8B — FREE + INSTANT" },
  },
  {
    id: "gemini", label: "Gemini", icon: "🔵", badge: "FREE", badgeColor: "rgba(59,130,246,0.12)", badgeBorder: "rgba(59,130,246,0.3)", badgeText: "#60a5fa",
    url: "https://aistudio.google.com/app/apikey", ph: "AIza…",
    models: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-3.1-flash-lite"],
    modelLabels: { "gemini-3.5-flash": "Gemini 3.5 Flash — FREE", "gemini-2.5-flash": "Gemini 2.5 Flash — FREE", "gemini-2.5-pro": "Gemini 2.5 Pro — FREE", "gemini-2.0-flash": "Gemini 2.0 Flash — FREE", "gemini-3.1-flash-lite": "Gemini 3.1 Lite — FREE" },
  },
  {
    id: "openrouter", label: "OpenRouter", icon: "🔀", badge: "16 FREE", badgeColor: "rgba(34,197,94,0.1)", badgeBorder: "rgba(34,197,94,0.28)", badgeText: "#4ade80",
    url: "https://openrouter.ai/keys", ph: "sk-or-…",
    models: OPENROUTER_FREE_MODELS.map(m => m.id),
    modelLabels: Object.fromEntries(OPENROUTER_FREE_MODELS.map(m => [m.id, `${m.name} — FREE`])),
  },
  {
    id: "nvidia", label: "NVIDIA", icon: "🟢", badge: "FREE", badgeColor: "rgba(34,197,94,0.1)", badgeBorder: "rgba(34,197,94,0.25)", badgeText: "#4ade80",
    url: "https://build.nvidia.com/", ph: "nvapi-…",
    models: NVIDIA_MODELS.map(m => m.id),
    modelLabels: Object.fromEntries(NVIDIA_MODELS.map(m => [m.id, `${m.name} — FREE`])),
  },
];

export const ApiSetupPage: React.FC = () => {
  const { setAppScreen, settings, updateSettings, setApiKey } = useStore();
  const [deepgram, setDeepgram]     = useState(settings.deepgramApiKey || "");
  const [aiKeys, setAiKeys]         = useState<Record<string, string>>(() => {
    const k: Record<string, string> = {};
    AI_PROVIDERS.forEach(p => { k[p.id] = settings.apiKeys[p.id] || ""; });
    return k;
  });
  const [selModel, setSelModel]     = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    AI_PROVIDERS.forEach(p => { m[p.id] = p.models[0]; });
    const cur = settings.activeProvider;
    const curP = AI_PROVIDERS.find(p => p.id === cur);
    if (curP?.models.includes(settings.activeModel)) m[cur] = settings.activeModel;
    return m;
  });
  const [showKeys, setShowKeys]     = useState<Record<string, boolean>>({});
  const [activeProv, setActiveProv] = useState(settings.activeProvider);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [deepFocused, setDeepFocused] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, { status: "idle" | "testing" | "valid" | "invalid"; message?: string }>>({});

  const hasDeepgram = !!deepgram.trim();
  const filledAI    = AI_PROVIDERS.filter(p => aiKeys[p.id]?.trim());
  const hasAnyAI    = filledAI.length > 0;
  const canProceed  = hasDeepgram && hasAnyAI;

  useEffect(() => {
    if (filledAI.length > 0 && !aiKeys[activeProv]?.trim()) setActiveProv(filledAI[0].id);
  }, [JSON.stringify(aiKeys)]);

  const handleTestKey = async (providerId: string, apiKey: string) => {
    const key = apiKey.trim();
    if (!key) {
      setTestStatus(prev => ({
        ...prev,
        [providerId]: { status: "invalid", message: "Enter an API key first" }
      }));
      return;
    }

    setTestStatus(prev => ({
      ...prev,
      [providerId]: { status: "testing" }
    }));

    try {
      if (providerId === "deepgram") {
        // Real Deepgram test: send silent WAV buffer to /v1/listen REST endpoint
        const silentWav = new Uint8Array([
          0x52,0x49,0x46,0x46, 0x24,0x00,0x00,0x00, 0x57,0x41,0x56,0x45,
          0x66,0x6d,0x74,0x20, 0x10,0x00,0x00,0x00, 0x01,0x00,0x01,0x00,
          0x44,0xac,0x00,0x00, 0x88,0x58,0x01,0x00, 0x02,0x00,0x10,0x00,
          0x64,0x61,0x74,0x61, 0x00,0x00,0x00,0x00
        ]);
        const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-2", {
          method: "POST",
          headers: {
            Authorization: `Token ${key}`,
            "Content-Type": "audio/wav",
          },
          body: silentWav,
        });
        if (res.ok) {
          setTestStatus(prev => ({ ...prev, deepgram: { status: "valid", message: "Deepgram Key Valid! ⚡" } }));
        } else {
          setTestStatus(prev => ({ ...prev, deepgram: { status: "invalid", message: `Invalid Key (HTTP ${res.status})` } }));
        }
      } else if (providerId === "gemini") {
        // Real Gemini test: actual generateContent call
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }]
          })
        });
        if (res.ok) {
          setTestStatus(prev => ({ ...prev, gemini: { status: "valid", message: "Gemini Key Valid! 🔵" } }));
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || `Invalid Key (HTTP ${res.status})`;
          setTestStatus(prev => ({ ...prev, gemini: { status: "invalid", message: errMsg.length > 25 ? "Invalid Gemini Key" : errMsg } }));
        }
      } else if (providerId === "groq") {
        // Real Groq test: 1-token chat completion call
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
          })
        });
        if (res.ok) {
          setTestStatus(prev => ({ ...prev, groq: { status: "valid", message: "Groq Key Valid! ⚡" } }));
        } else {
          setTestStatus(prev => ({ ...prev, groq: { status: "invalid", message: `Invalid Key (HTTP ${res.status})` } }));
        }
      } else if (providerId === "openrouter") {
        // Real OpenRouter test: auth check endpoint
        const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: { Authorization: `Bearer ${key}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.data) {
          setTestStatus(prev => ({ ...prev, openrouter: { status: "valid", message: "OpenRouter Key Valid! 🔀" } }));
        } else {
          setTestStatus(prev => ({ ...prev, openrouter: { status: "invalid", message: `Invalid Key (HTTP ${res.status})` } }));
        }
      } else if (providerId === "nvidia") {
        // Real NVIDIA test: 1-token chat completion call
        const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "meta/llama-3.3-70b-instruct",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
          })
        }).catch(() => null);
        if (res && res.ok) {
          setTestStatus(prev => ({ ...prev, nvidia: { status: "valid", message: "NVIDIA Key Valid! 🟢" } }));
        } else {
          setTestStatus(prev => ({ ...prev, nvidia: { status: "invalid", message: "Invalid NVIDIA Key" } }));
        }
      }
    } catch (err: any) {
      setTestStatus(prev => ({
        ...prev,
        [providerId]: { status: "invalid", message: err?.message || "Network test failed" }
      }));
    }
  };

  const handleSave = () => {
    if (!canProceed) return;
    const trimmedDeepgram = deepgram.trim();
    const updatedApiKeys = { ...settings.apiKeys };
    AI_PROVIDERS.forEach(p => {
      if (aiKeys[p.id]?.trim()) {
        updatedApiKeys[p.id] = aiKeys[p.id].trim();
        setApiKey(p.id, aiKeys[p.id].trim());
      }
    });

    updateSettings({
      deepgramApiKey: trimmedDeepgram,
      transcriptionEngine: "deepgram",
      apiKeys: updatedApiKeys,
      activeProvider: activeProv as any,
      activeModel: selModel[activeProv] || AI_PROVIDERS.find(p => p.id === activeProv)?.models[0] || "",
    });

    window.ghostly.saveSettings(useStore.getState().settings);
    setAppScreen("audio-setup");
  };

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2 overflow-y-auto"
      style={{ background: "transparent", pointerEvents: "none", userSelect: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(139,92,246,0.09) 0%, transparent 60%)" }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[310px] flex flex-col gap-2.5 relative z-10"
        style={{ pointerEvents: "auto" }}
        onMouseEnter={() => window.ghostly.enableMouse()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-[13px] flex items-center justify-center text-[17px] shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.18))",
                border: "1.5px solid rgba(139,92,246,0.4)",
                boxShadow: "0 0 20px rgba(139,92,246,0.25), 0 4px 12px rgba(0,0,0,0.4)",
              }}
            >🔑</div>
            <div>
              <p className="text-[13px] font-black text-white leading-tight">API Setup</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="h-1 rounded-full transition-all"
                    style={{
                      width: i <= 2 ? "20px" : "10px",
                      background: i <= 2 ? "rgba(139,92,246,0.8)" : "rgba(255,255,255,0.12)",
                    }}
                  />
                ))}
                <span className="text-[8px] font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>Step 2/3</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setAppScreen("interview-setup")}
            className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-xl transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
        </div>

        {/* ── Main Card ── */}
        <div
          className="w-full rounded-[22px] overflow-hidden"
          style={{
            background: "rgba(13,13,20,0.9)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
          }}
        >
          {/* Accent bar */}
          <div className="h-0.5" style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.7), rgba(99,102,241,0.5), transparent)" }} />

          {/* ── Progress checklist ── */}
          <div className="px-4 pt-3.5 pb-3">
            <div className="flex items-center gap-3">
              {/* Deepgram step */}
              <div className="flex items-center gap-2 flex-1">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 transition-all"
                  style={{
                    background: hasDeepgram ? "linear-gradient(135deg, #22c55e, #16a34a)" : "rgba(255,255,255,0.06)",
                    border: hasDeepgram ? "none" : "1px solid rgba(255,255,255,0.1)",
                    color: hasDeepgram ? "#fff" : "rgba(255,255,255,0.3)",
                    boxShadow: hasDeepgram ? "0 0 10px rgba(34,197,94,0.4)" : "none",
                  }}
                >{hasDeepgram ? "✓" : "1"}</div>
                <span className="text-[9px] font-bold transition-colors" style={{ color: hasDeepgram ? "#4ade80" : "rgba(255,255,255,0.3)" }}>Deepgram</span>
              </div>

              {/* Connector */}
              <div className="flex-1 h-px rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: hasDeepgram && hasAnyAI ? "100%" : "0%",
                  background: "linear-gradient(90deg, #22c55e, #4ade80)",
                  transition: "width 0.4s ease",
                }} />
              </div>

              {/* AI Provider step */}
              <div className="flex items-center gap-2 flex-1 justify-end">
                <span className="text-[9px] font-bold transition-colors" style={{ color: hasAnyAI ? "#4ade80" : "rgba(255,255,255,0.3)" }}>AI Provider</span>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 transition-all"
                  style={{
                    background: hasAnyAI ? "linear-gradient(135deg, #22c55e, #16a34a)" : "rgba(255,255,255,0.06)",
                    border: hasAnyAI ? "none" : "1px solid rgba(255,255,255,0.1)",
                    color: hasAnyAI ? "#fff" : "rgba(255,255,255,0.3)",
                    boxShadow: hasAnyAI ? "0 0 10px rgba(34,197,94,0.4)" : "none",
                  }}
                >{hasAnyAI ? "✓" : "2"}</div>
              </div>
            </div>
          </div>

          <div className="mx-4 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

          <div className="px-3.5 pt-3 pb-2 flex flex-col gap-3 max-h-[55vh] overflow-y-auto" style={{ scrollbarWidth: "none" }}>

            {/* ── Deepgram ── */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[8px] font-black uppercase tracking-[0.12em] flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                  🎙️ Deepgram
                  <span className="px-1.5 py-0.5 rounded-full text-[7px] font-black" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)", color: "#f87171" }}>REQUIRED</span>
                </label>
                <button
                  onClick={() => window.ghostly.openExternal("https://console.deepgram.com/signup")}
                  className="text-[8.5px] font-bold transition-colors"
                  style={{ color: "rgba(139,92,246,0.7)", background: "none", border: "none" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#a78bfa"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "rgba(139,92,246,0.7)"; }}
                >Get Free Key ↗</button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none">🎙️</span>
                <input
                  type={showKeys["deepgram"] ? "text" : "password"}
                  value={deepgram} onChange={e => setDeepgram(e.target.value)}
                  onFocus={() => setDeepFocused(true)}
                  onBlur={() => setDeepFocused(false)}
                  placeholder="Paste Deepgram API key…"
                  className="w-full rounded-xl text-[11px] font-mono focus:outline-none transition-all placeholder:text-white/15"
                  style={{
                    padding: "9px 36px 9px 36px",
                    background: "rgba(255,255,255,0.04)",
                    border: hasDeepgram
                      ? "1px solid rgba(34,197,94,0.4)"
                      : deepFocused ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    boxShadow: hasDeepgram ? "0 0 12px rgba(34,197,94,0.12)" : deepFocused ? "0 0 0 3px rgba(139,92,246,0.1)" : "none",
                    color: "rgba(255,255,255,0.85)",
                  }}
                />
                <button
                  onClick={() => setShowKeys(s => ({ ...s, deepgram: !s["deepgram"] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] transition-opacity opacity-40 hover:opacity-80"
                >{showKeys["deepgram"] ? "🙈" : "👁"}</button>
              </div>

              {/* Test Deepgram Key button */}
              <div className="flex items-center justify-between mt-0.5">
                <button
                  type="button"
                  onClick={() => handleTestKey("deepgram", deepgram)}
                  disabled={!hasDeepgram || testStatus["deepgram"]?.status === "testing"}
                  className="text-[8.5px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all"
                  style={{
                    background: testStatus["deepgram"]?.status === "valid"
                      ? "rgba(34,197,94,0.15)"
                      : testStatus["deepgram"]?.status === "invalid"
                        ? "rgba(239,68,68,0.15)"
                        : "rgba(139,92,246,0.12)",
                    border: testStatus["deepgram"]?.status === "valid"
                      ? "1px solid rgba(34,197,94,0.3)"
                      : testStatus["deepgram"]?.status === "invalid"
                        ? "1px solid rgba(239,68,68,0.3)"
                        : "1px solid rgba(139,92,246,0.3)",
                    color: testStatus["deepgram"]?.status === "valid"
                      ? "#4ade80"
                      : testStatus["deepgram"]?.status === "invalid"
                        ? "#f87171"
                        : "#a78bfa",
                    cursor: !hasDeepgram ? "not-allowed" : "pointer",
                    opacity: !hasDeepgram ? 0.5 : 1,
                  }}
                >
                  {testStatus["deepgram"]?.status === "testing" ? "🔄 Testing..." : "⚡ Test Key"}
                </button>

                {testStatus["deepgram"]?.message && (
                  <span className="text-[8px] font-bold" style={{ color: testStatus["deepgram"]?.status === "valid" ? "#4ade80" : "#f87171" }}>
                    {testStatus["deepgram"]?.message}
                  </span>
                )}
              </div>
            </div>

            <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

            {/* ── AI Providers ── */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  🤖 AI Provider
                </label>
                <span className="text-[8.5px] font-bold" style={{ color: hasAnyAI ? "#4ade80" : "rgba(255,255,255,0.25)" }}>
                  {filledAI.length}/{AI_PROVIDERS.length} added
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {AI_PROVIDERS.map(p => {
                  const hasKey   = !!aiKeys[p.id]?.trim();
                  const isActive = activeProv === p.id;
                  const isOpen   = expanded === p.id;

                  return (
                    <div
                      key={p.id}
                      className="rounded-[14px] overflow-hidden transition-all"
                      style={{
                        background: isActive && hasKey ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.04)",
                        border: isActive && hasKey
                          ? "1px solid rgba(139,92,246,0.3)"
                          : "1px solid rgba(255,255,255,0.07)",
                        boxShadow: isActive && hasKey ? "0 0 16px rgba(139,92,246,0.12)" : "none",
                      }}
                    >
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <span className="text-[15px] shrink-0">{p.icon}</span>
                        <span className="text-[11px] font-bold flex-1" style={{ color: isActive && hasKey ? "#a78bfa" : "rgba(255,255,255,0.7)" }}>
                          {p.label}
                        </span>

                        {/* Badge */}
                        <span
                          className="text-[7px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: p.badgeColor, border: `1px solid ${p.badgeBorder}`, color: p.badgeText }}
                        >{p.badge}</span>

                        {/* Has key indicator */}
                        {hasKey && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80" }}>✓</span>
                        )}

                        {/* Set active */}
                        {hasKey && (
                          <button
                            onClick={() => setActiveProv(p.id)}
                            className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase transition-all shrink-0"
                            style={{
                              background: isActive ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)",
                              border: isActive ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(255,255,255,0.1)",
                              color: isActive ? "#a78bfa" : "rgba(255,255,255,0.35)",
                            }}
                          >{isActive ? "Active" : "Use"}</button>
                        )}

                        {/* External link */}
                        <button
                          onClick={() => window.ghostly.openExternal(p.url)}
                          className="text-[10px] font-bold transition-colors shrink-0 opacity-35 hover:opacity-80"
                          style={{ background: "none", border: "none", color: "#a78bfa" }}
                        >↗</button>

                        {/* Expand toggle */}
                        <button
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                          className="text-[9px] transition-transform duration-200 shrink-0"
                          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", transform: isOpen ? "rotate(180deg)" : "none" }}
                        >▼</button>
                      </div>

                      {/* Expanded API key input */}
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                          className="px-3 pb-3 flex flex-col gap-2"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          <div className="relative mt-2.5">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none opacity-50">🔑</span>
                            <input
                              type={showKeys[p.id] ? "text" : "password"}
                              value={aiKeys[p.id] || ""}
                              onChange={e => setAiKeys(k => ({ ...k, [p.id]: e.target.value }))}
                              placeholder={p.ph}
                              className="w-full rounded-xl text-[10px] font-mono focus:outline-none transition-all placeholder:text-white/15"
                              style={{
                                padding: "8px 32px 8px 28px",
                                background: "rgba(255,255,255,0.04)",
                                border: hasKey ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(255,255,255,0.09)",
                                boxShadow: hasKey ? "0 0 8px rgba(34,197,94,0.12)" : "none",
                                color: "rgba(255,255,255,0.82)",
                              }}
                              onFocus={e => { if (!hasKey) { e.currentTarget.style.borderColor = "rgba(139,92,246,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(139,92,246,0.1)"; } }}
                              onBlur={e => { if (!hasKey) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; e.currentTarget.style.boxShadow = "none"; } }}
                            />
                            <button
                              onClick={() => setShowKeys(s => ({ ...s, [p.id]: !s[p.id] }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] opacity-40 hover:opacity-80 transition-opacity"
                            >{showKeys[p.id] ? "🙈" : "👁"}</button>
                          </div>

                          {hasKey && (
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-bold uppercase shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>Model</span>
                              <select
                                value={selModel[p.id] || p.models[0]}
                                onChange={e => setSelModel(m => ({ ...m, [p.id]: e.target.value }))}
                                className="flex-1 text-[9px] font-semibold rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer transition-all"
                                style={{
                                  background: "rgba(255,255,255,0.06)",
                                  border: "1px solid rgba(255,255,255,0.09)",
                                  color: "rgba(255,255,255,0.7)",
                                }}
                              >
                                {p.models.map(m => (
                                  <option key={m} value={m} style={{ background: "#0d0d14" }}>{(p as any).modelLabels?.[m] || m}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Test Key button for AI Provider */}
                          <div className="flex items-center justify-between mt-1 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                            <button
                              type="button"
                              onClick={() => handleTestKey(p.id, aiKeys[p.id] || "")}
                              disabled={!hasKey || testStatus[p.id]?.status === "testing"}
                              className="text-[8.5px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all"
                              style={{
                                background: testStatus[p.id]?.status === "valid"
                                  ? "rgba(34,197,94,0.15)"
                                  : testStatus[p.id]?.status === "invalid"
                                    ? "rgba(239,68,68,0.15)"
                                    : "rgba(139,92,246,0.12)",
                                border: testStatus[p.id]?.status === "valid"
                                  ? "1px solid rgba(34,197,94,0.3)"
                                  : testStatus[p.id]?.status === "invalid"
                                    ? "1px solid rgba(239,68,68,0.3)"
                                    : "1px solid rgba(139,92,246,0.3)",
                                color: testStatus[p.id]?.status === "valid"
                                  ? "#4ade80"
                                  : testStatus[p.id]?.status === "invalid"
                                    ? "#f87171"
                                    : "#a78bfa",
                                cursor: !hasKey ? "not-allowed" : "pointer",
                                opacity: !hasKey ? 0.5 : 1,
                              }}
                            >
                              {testStatus[p.id]?.status === "testing" ? "🔄 Testing..." : "⚡ Test Key"}
                            </button>

                            {testStatus[p.id]?.message && (
                              <span className="text-[8px] font-bold truncate max-w-[170px]" style={{ color: testStatus[p.id]?.status === "valid" ? "#4ade80" : "#f87171" }}>
                                {testStatus[p.id]?.message}
                              </span>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[8px] text-center" style={{ color: "rgba(255,255,255,0.2)" }}>
                OpenAI · Anthropic · Grok — coming soon
              </p>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-3.5 pb-3.5 pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <motion.button
              whileHover={canProceed ? { scale: 1.02, y: -1 } : {}}
              whileTap={canProceed ? { scale: 0.97 } : {}}
              onClick={handleSave} disabled={!canProceed}
              className="w-full py-3 rounded-[14px] text-[12px] font-extrabold flex items-center justify-center gap-2 relative overflow-hidden transition-all"
              style={{
                background: canProceed ? "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)" : "rgba(255,255,255,0.04)",
                color: canProceed ? "#fff" : "rgba(255,255,255,0.22)",
                border: canProceed ? "none" : "1px solid rgba(255,255,255,0.07)",
                boxShadow: canProceed ? "0 6px 24px rgba(139,92,246,0.45), 0 1px 0 rgba(255,255,255,0.2) inset" : "none",
                cursor: canProceed ? "pointer" : "not-allowed",
              }}
            >
              {canProceed && (
                <motion.div
                  className="absolute inset-0 w-1/3"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }}
                  animate={{ x: ["-100%", "400%"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              )}
              <span className="relative z-10 text-[15px]">{canProceed ? "🎙️" : "🔒"}</span>
              <span className="relative z-10">{canProceed ? "Save & Continue →" : "Complete required fields"}</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
