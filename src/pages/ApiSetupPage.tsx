import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store/useStore";
import { NVIDIA_MODELS } from "../lib/ai/nvidia";
import { OPENROUTER_FREE_MODELS } from "../lib/ai/openrouter";

const AI_PROVIDERS = [
  { id: "groq",       label: "Groq",        icon: "🟣", color: "#f43f5e", url: "https://console.groq.com/keys",               ph: "gsk_…",               models: ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"], modelLabels: { "meta-llama/llama-4-scout-17b-16e-instruct": "Llama 4 Scout (FREE + VISION)", "llama-3.3-70b-versatile": "Llama 3.3 70B (FREE + ULTRA FAST)", "llama-3.1-8b-instant": "Llama 3.1 8B (FREE + INSTANT)" } },
  { id: "gemini",     label: "Gemini",      icon: "🔵", color: "#4285F4", url: "https://aistudio.google.com/app/apikey",     ph: "AIza…",               models: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-3.1-flash-lite"], modelLabels: { "gemini-3.5-flash": "Gemini 3.5 Flash (FREE + LATEST)", "gemini-2.5-flash": "Gemini 2.5 Flash (FREE + STABLE)", "gemini-2.5-pro": "Gemini 2.5 Pro (FREE + POWERFUL)", "gemini-2.0-flash": "Gemini 2.0 Flash (FREE + FAST)", "gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite (FREE + LIGHTWEIGHT)" } },
  { id: "openrouter", label: "OpenRouter",  icon: "🔀", color: "#8b5cf6", url: "https://openrouter.ai/keys",                  ph: "sk-or-…",             models: OPENROUTER_FREE_MODELS.map(m => m.id), modelLabels: Object.fromEntries(OPENROUTER_FREE_MODELS.map(m => [m.id, `${m.name} (FREE)`])) },
  { id: "nvidia",     label: "NVIDIA",      icon: "🟢", color: "#76b900", url: "https://build.nvidia.com/",                   ph: "nvapi-…",            models: NVIDIA_MODELS.map(m => m.id), modelLabels: Object.fromEntries(NVIDIA_MODELS.map(m => [m.id, `${m.name} (FREE)`])) },
  { id: "openai",     label: "OpenAI",      icon: "🟢", color: "#94a3b8", url: "#",                                            ph: "Coming Soon",        models: [], comingSoon: true },
  { id: "grok",       label: "Grok (xAI)",  icon: "⚫", color: "#94a3b8", url: "#",                                            ph: "Coming Soon",        models: [], comingSoon: true },
  { id: "anthropic",  label: "Anthropic",   icon: "🟠", color: "#94a3b8", url: "#",                                            ph: "Coming Soon",        models: [], comingSoon: true },
];

export const ApiSetupPage: React.FC = () => {
  const { setAppScreen, settings, updateSettings, setApiKey } = useStore();
  const [deepgram, setDeepgram]   = useState(settings.deepgramApiKey || "");
  const [aiKeys, setAiKeys]       = useState<Record<string, string>>(() => {
    const k: Record<string, string> = {};
    AI_PROVIDERS.forEach(p => { k[p.id] = settings.apiKeys[p.id] || ""; });
    return k;
  });
  const [selModel, setSelModel]   = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    AI_PROVIDERS.forEach(p => { m[p.id] = p.models[0]; });
    const cur = settings.activeProvider;
    const curP = AI_PROVIDERS.find(p => p.id === cur);
    if (curP?.models.includes(settings.activeModel)) m[cur] = settings.activeModel;
    return m;
  });
  const [showKeys, setShowKeys]   = useState<Record<string, boolean>>({});
  const [activeProv, setActiveProv] = useState(settings.activeProvider);
  const [expanded, setExpanded]   = useState<string | null>(null);

  const hasDeepgram = !!deepgram.trim();
  const filledAI    = AI_PROVIDERS.filter(p => aiKeys[p.id]?.trim());
  const hasAnyAI    = filledAI.length > 0;
  const canProceed  = hasDeepgram && hasAnyAI;

  useEffect(() => {
    if (filledAI.length > 0 && !aiKeys[activeProv]?.trim()) setActiveProv(filledAI[0].id);
  }, [JSON.stringify(aiKeys)]);

  const handleSave = () => {
    if (!canProceed) return;
    AI_PROVIDERS.forEach(p => setApiKey(p.id, aiKeys[p.id]?.trim() || ""));
    updateSettings({
      deepgramApiKey: deepgram.trim(),
      transcriptionEngine: "deepgram",
      activeProvider: activeProv as any,
      activeModel: selModel[activeProv] || AI_PROVIDERS.find(p => p.id === activeProv)?.models[0] || "",
    });
    // Fix: save settings to disk immediately after update
    setTimeout(() => window.ghostly.saveSettings(useStore.getState().settings), 50);
    setAppScreen("audio-setup");
  };

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2 overflow-y-auto"
      style={{ background: "transparent", pointerEvents: "auto", userSelect: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
      onMouseEnter={() => window.ghostly.enableMouse()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[300px] flex flex-col gap-2"
        style={{ pointerEvents: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[16px] shrink-0"
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", boxShadow: "0 3px 10px rgba(99,102,241,0.38)" }}>🔑</div>
            <div>
              <p className="text-[12px] font-extrabold text-white leading-tight">API Setup</p>
              <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Step 2 of 3 · Stored locally</p>
            </div>
          </div>
          <button
            onClick={() => setAppScreen("interview-setup")}
            className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-[8px] transition-all"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
        </div>

        {/* Card */}
        <div className="w-full rounded-[16px] overflow-hidden"
          style={{ background: "#fff", boxShadow: "0 12px 40px rgba(0,0,0,0.18), 0 1px 0 #fff inset", border: "1px solid rgba(255,255,255,0.9)" }}>

          <div className="px-3 pt-3 pb-2 flex flex-col gap-2.5 max-h-[62vh] overflow-y-auto" style={{ scrollbarWidth: "none" }}>

            {/* Deepgram */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[7px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  🎙️ Deepgram
                  <span className="px-1 py-0.5 rounded text-[6px] font-black" style={{ background: "#fef2f2", color: "#dc2626" }}>Required</span>
                </label>
                <button onClick={() => window.ghostly.openExternal("https://console.deepgram.com/signup")}
                  className="text-[8px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors">Get Key ↗</button>
              </div>
              <div className="relative">
                <input
                  type={showKeys["deepgram"] ? "text" : "password"}
                  value={deepgram} onChange={e => setDeepgram(e.target.value)}
                  placeholder="Paste Deepgram API key…"
                  className="w-full rounded-[8px] px-2.5 pr-8 py-2 text-[11px] font-mono focus:outline-none transition-all"
                  style={{ border: `1.5px solid ${hasDeepgram ? "#10b981" : "#fca5a5"}`, background: hasDeepgram ? "#f0fdf4" : "#fff5f5", color: "#0f172a" }}
                />
                <button onClick={() => setShowKeys(s => ({ ...s, deepgram: !s["deepgram"] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                  {showKeys["deepgram"] ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <div className="h-px" style={{ background: "#f1f5f9" }} />

            {/* AI Providers */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">🤖 AI Provider</label>
                <span className="text-[8px] font-bold" style={{ color: hasAnyAI ? "#10b981" : "#94a3b8" }}>
                  {filledAI.length}/{AI_PROVIDERS.length} added
                </span>
              </div>

              <div className="flex flex-col gap-1">
                {AI_PROVIDERS.map(p => {
                  const hasKey  = !!aiKeys[p.id]?.trim();
                  const isActive = activeProv === p.id;
                  const isOpen  = expanded === p.id;
                  const isComingSoon = (p as any).comingSoon;

                  return (
                    <div key={p.id}
                      className="rounded-[10px] overflow-hidden transition-all"
                      style={{
                        background: isComingSoon ? "#f1f5f9" : isActive && hasKey ? "#f0fdf4" : "#f8fafc",
                        border: `1.5px solid ${isComingSoon ? "#cbd5e1" : isActive && hasKey ? "#a7f3d0" : hasKey ? "#d1fae5" : "#e2e8f0"}`,
                        opacity: isComingSoon ? 0.6 : 1,
                      }}
                    >
                      {/* Provider row */}
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <span className="text-[13px] shrink-0">{p.icon}</span>
                        <span className="text-[10px] font-extrabold flex-1" style={{ color: p.color }}>{p.label}</span>
                        {isComingSoon && (
                          <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#d97706" }}>COMING SOON</span>
                        )}
                        {!isComingSoon && hasKey && (
                          <span className="text-[7px] font-black px-1 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#16a34a" }}>✓</span>
                        )}
                        {!isComingSoon && hasKey && (
                          <button onClick={() => setActiveProv(p.id)}
                            className="text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase transition-all"
                            style={{ background: isActive ? "#10b981" : "#e2e8f0", color: isActive ? "#fff" : "#64748b" }}>
                            {isActive ? "Active" : "Use"}
                          </button>
                        )}
                        {!isComingSoon && (
                          <>
                            <button onClick={() => window.ghostly.openExternal(p.url)}
                              className="text-[8px] font-bold text-blue-400 hover:text-blue-600 transition-colors">↗</button>
                            <button onClick={() => setExpanded(isOpen ? null : p.id)}
                              className="text-[8px] text-slate-400 transition-transform duration-200"
                              style={{ transform: isOpen ? "rotate(180deg)" : "none" }}>▼</button>
                          </>
                        )}
                      </div>

                      {/* Expanded: key input + model */}
                      {isOpen && (
                        <div className="px-2.5 pb-2 flex flex-col gap-1.5 border-t" style={{ borderColor: "#f1f5f9" }}>
                          <div className="relative mt-1.5">
                            <input
                              type={p.isUrl ? "text" : showKeys[p.id] ? "text" : "password"}
                              value={aiKeys[p.id] || ""}
                              onChange={e => setAiKeys(k => ({ ...k, [p.id]: e.target.value }))}
                              placeholder={p.isUrl ? "http://localhost:11434" : p.ph}
                              className="w-full rounded-[7px] px-2.5 pr-8 py-1.5 text-[10px] font-mono focus:outline-none transition-all"
                              style={{ border: `1.5px solid ${hasKey ? "#a7f3d0" : "#e2e8f0"}`, background: "#fff", color: "#0f172a" }}
                            />
                            {!p.isUrl && (
                              <button onClick={() => setShowKeys(s => ({ ...s, [p.id]: !s[p.id] }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                                {showKeys[p.id] ? "🙈" : "👁"}
                              </button>
                            )}
                          </div>
                          {hasKey && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[7px] font-bold text-slate-400 uppercase shrink-0">Model</span>
                              <select
                                value={selModel[p.id] || p.models[0]}
                                onChange={e => setSelModel(m => ({ ...m, [p.id]: e.target.value }))}
                                className="flex-1 text-[9px] font-semibold rounded-[6px] px-1.5 py-0.5 focus:outline-none cursor-pointer"
                                style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#334155" }}
                              >
                                {p.models.map(m => (
                                  <option key={m} value={m}>{(p as any).modelLabels?.[m] || m}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-3 pb-3 pt-2" style={{ borderTop: "1px solid #f1f5f9" }}>
            {/* Progress dots */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black"
                  style={{ background: hasDeepgram ? "#10b981" : "#e2e8f0", color: hasDeepgram ? "#fff" : "#94a3b8" }}>
                  {hasDeepgram ? "✓" : "1"}
                </div>
                <span className="text-[8px] font-semibold" style={{ color: hasDeepgram ? "#10b981" : "#94a3b8" }}>Deepgram</span>
              </div>
              <div className="flex-1 h-px" style={{ background: hasDeepgram && hasAnyAI ? "#10b981" : "#e2e8f0" }} />
              <div className="flex items-center gap-1">
                <span className="text-[8px] font-semibold" style={{ color: hasAnyAI ? "#10b981" : "#94a3b8" }}>AI Provider</span>
                <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black"
                  style={{ background: hasAnyAI ? "#10b981" : "#e2e8f0", color: hasAnyAI ? "#fff" : "#94a3b8" }}>
                  {hasAnyAI ? "✓" : "2"}
                </div>
              </div>
            </div>

            <motion.button
              whileHover={canProceed ? { scale: 1.02, y: -1 } : {}}
              whileTap={canProceed ? { scale: 0.98 } : {}}
              onClick={handleSave} disabled={!canProceed}
              className="w-full py-2.5 rounded-[11px] text-[12px] font-extrabold flex items-center justify-center gap-2 relative overflow-hidden group transition-all"
              style={{
                background: canProceed ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "#f1f5f9",
                color: canProceed ? "#fff" : "#94a3b8",
                boxShadow: canProceed ? "0 5px 18px rgba(99,102,241,0.32)" : "none",
                cursor: canProceed ? "pointer" : "not-allowed", border: "none",
              }}
            >
              {canProceed && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[200%] skew-x-[25deg] group-hover:translate-x-[200%] transition-transform duration-600" />}
              <span className="text-[14px]">{canProceed ? "🎙️" : "🔒"}</span>
              {canProceed ? "Save & Continue →" : "Complete required fields"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
