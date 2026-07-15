import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store/useStore";
import { NVIDIA_MODELS } from "../lib/ai/nvidia";
import { OPENROUTER_FREE_MODELS } from "../lib/ai/openrouter";

const BASE = "#1c1917";
const nm = (raised = true) =>
  raised
    ? "6px 6px 14px rgba(0,0,0,0.55), -3px -3px 8px rgba(255,255,255,0.04)"
    : "inset 4px 4px 10px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.04)";

const AI_PROVIDERS = [
  { id: "groq",       label: "Groq",       icon: "🟣", badge: "FAST",     url: "https://console.groq.com/keys",           ph: "gsk_…",   models: ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"], modelLabels: { "meta-llama/llama-4-scout-17b-16e-instruct": "Llama 4 Scout — FREE + VISION", "llama-3.3-70b-versatile": "Llama 3.3 70B — FREE + FAST", "llama-3.1-8b-instant": "Llama 3.1 8B — FREE + INSTANT" } },
  { id: "gemini",     label: "Gemini",     icon: "🔵", badge: "FREE",     url: "https://aistudio.google.com/app/apikey", ph: "AIza…",   models: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-3.1-flash-lite"], modelLabels: { "gemini-3.5-flash": "Gemini 3.5 Flash — FREE", "gemini-2.5-flash": "Gemini 2.5 Flash — FREE", "gemini-2.5-pro": "Gemini 2.5 Pro — FREE", "gemini-2.0-flash": "Gemini 2.0 Flash — FREE", "gemini-3.1-flash-lite": "Gemini 3.1 Lite — FREE" } },
  { id: "openrouter", label: "OpenRouter", icon: "🔀", badge: "16 FREE",  url: "https://openrouter.ai/keys",              ph: "sk-or-…", models: OPENROUTER_FREE_MODELS.map(m => m.id), modelLabels: Object.fromEntries(OPENROUTER_FREE_MODELS.map(m => [m.id, `${m.name} — FREE`])) },
  { id: "nvidia",     label: "NVIDIA",     icon: "🟢", badge: "FREE",     url: "https://build.nvidia.com/",               ph: "nvapi-…", models: NVIDIA_MODELS.map(m => m.id), modelLabels: Object.fromEntries(NVIDIA_MODELS.map(m => [m.id, `${m.name} — FREE`])) },
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
      deepgramApiKey: deepgram.trim(), transcriptionEngine: "deepgram",
      activeProvider: activeProv as any,
      activeModel: selModel[activeProv] || AI_PROVIDERS.find(p => p.id === activeProv)?.models[0] || "",
    });
    setTimeout(() => window.ghostly.saveSettings(useStore.getState().settings), 50);
    setAppScreen("audio-setup");
  };

  const nmInput: React.CSSProperties = {
    background: BASE, boxShadow: nm(false), border: "none",
    color: "rgba(255,255,255,0.8)", borderRadius: "9px", padding: "7px 10px 7px 32px",
    fontSize: "10.5px", fontFamily: "monospace", fontWeight: 600,
    width: "100%", outline: "none", transition: "box-shadow 0.15s",
  };

  const LABEL = "text-[7px] font-black uppercase tracking-[0.1em]";
  const LC: React.CSSProperties = { color: "rgba(255,255,255,0.28)" };

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2 overflow-y-auto"
      style={{ background: "transparent", pointerEvents: "none", userSelect: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[300px] flex flex-col gap-2"
        style={{ pointerEvents: "auto" }}
        onMouseEnter={() => window.ghostly.enableMouse()}
        onMouseLeave={() => window.ghostly.disableMouse()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-[11px] flex items-center justify-center text-[15px] shrink-0"
              style={{
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                boxShadow: "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 16px rgba(99,102,241,0.28)",
              }}
            >🔑</div>
            <div>
              <p className="text-[12px] font-extrabold text-white leading-tight">API Setup</p>
              <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.28)" }}>Step 2 of 3 · Stored locally</p>
            </div>
          </div>
          <button
            onClick={() => setAppScreen("interview-setup")}
            className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-[9px] transition-all"
            style={{ background: BASE, boxShadow: nm(), color: "rgba(255,255,255,0.45)", border: "none" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
        </div>

        {/* Card */}
        <div className="w-full rounded-[18px] overflow-hidden" style={{ background: BASE, boxShadow: nm() }}>

          {/* Progress bar top */}
          <div className="px-3 pt-3 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black shrink-0 transition-all"
                  style={{
                    background: hasDeepgram ? "linear-gradient(135deg, #22c55e, #16a34a)" : BASE,
                    boxShadow: hasDeepgram ? "0 0 10px rgba(34,197,94,0.4)" : nm(false),
                    color: hasDeepgram ? "#fff" : "rgba(255,255,255,0.3)",
                  }}
                >{hasDeepgram ? "✓" : "1"}</div>
                <span className="text-[8px] font-bold" style={{ color: hasDeepgram ? "#22c55e" : "rgba(255,255,255,0.3)" }}>Deepgram</span>
              </div>
              <div className="flex-1 h-0.5 rounded-full mx-1" style={{ background: BASE, boxShadow: nm(false) }}>
                <div className="h-full rounded-full transition-all" style={{ width: hasDeepgram && hasAnyAI ? "100%" : "0%", background: "linear-gradient(90deg, #22c55e, #16a34a)" }} />
              </div>
              <div className="flex items-center gap-1.5 flex-1 justify-end">
                <span className="text-[8px] font-bold" style={{ color: hasAnyAI ? "#22c55e" : "rgba(255,255,255,0.3)" }}>AI Provider</span>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black shrink-0 transition-all"
                  style={{
                    background: hasAnyAI ? "linear-gradient(135deg, #22c55e, #16a34a)" : BASE,
                    boxShadow: hasAnyAI ? "0 0 10px rgba(34,197,94,0.4)" : nm(false),
                    color: hasAnyAI ? "#fff" : "rgba(255,255,255,0.3)",
                  }}
                >{hasAnyAI ? "✓" : "2"}</div>
              </div>
            </div>
          </div>

          <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.04)" }} />

          <div className="px-3 pt-2.5 pb-2 flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: "none" }}>

            {/* Deepgram */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className={`${LABEL} flex items-center gap-1.5`} style={LC}>
                  🎙️ Deepgram
                  <span className="px-1.5 py-0.5 rounded text-[6.5px] font-black" style={{ background: BASE, boxShadow: nm(false), color: "#f87171" }}>REQUIRED</span>
                </label>
                <button
                  onClick={() => window.ghostly.openExternal("https://console.deepgram.com/signup")}
                  className="text-[8px] font-bold transition-all"
                  style={{ color: "rgba(200,137,74,0.6)", background: "none", border: "none" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#c8894a"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "rgba(200,137,74,0.6)"; }}
                >Get Free Key ↗</button>
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none">🎙️</span>
                <input
                  type={showKeys["deepgram"] ? "text" : "password"}
                  value={deepgram} onChange={e => setDeepgram(e.target.value)}
                  placeholder="Paste Deepgram API key…"
                  className="w-full rounded-[9px] pr-8 py-2 text-[11px] font-mono focus:outline-none placeholder:text-white/15"
                  style={{
                    ...nmInput,
                    boxShadow: hasDeepgram ? `${nm(false)}, 0 0 0 1.5px rgba(34,197,94,0.35)` : nm(false),
                  }}
                />
                <button
                  onClick={() => setShowKeys(s => ({ ...s, deepgram: !s["deepgram"] }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] opacity-40 hover:opacity-80 transition-opacity"
                >{showKeys["deepgram"] ? "🙈" : "👁"}</button>
              </div>
            </div>

            <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />

            {/* AI Providers */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className={LABEL} style={LC}>🤖 AI Provider</label>
                <span className="text-[8px] font-bold" style={{ color: hasAnyAI ? "#22c55e" : "rgba(255,255,255,0.25)" }}>
                  {filledAI.length}/{AI_PROVIDERS.length} added
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {AI_PROVIDERS.map(p => {
                  const hasKey   = !!aiKeys[p.id]?.trim();
                  const isActive = activeProv === p.id;
                  const isOpen   = expanded === p.id;

                  return (
                    <div
                      key={p.id}
                      className="rounded-[12px] overflow-hidden transition-all"
                      style={{
                        background: BASE,
                        boxShadow: isActive && hasKey
                          ? `${nm()}, 0 0 0 1.5px rgba(200,137,74,0.35)`
                          : nm(),
                      }}
                    >
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <span className="text-[13px] shrink-0">{p.icon}</span>
                        <span className="text-[10px] font-extrabold flex-1" style={{ color: isActive && hasKey ? "#c8894a" : "rgba(255,255,255,0.65)" }}>
                          {p.label}
                        </span>
                        <span
                          className="text-[6.5px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: BASE, boxShadow: nm(false), color: "rgba(255,255,255,0.3)" }}
                        >{p.badge}</span>
                        {hasKey && (
                          <span
                            className="text-[7px] font-black px-1 py-0.5 rounded-full"
                            style={{ background: BASE, boxShadow: nm(false), color: "#22c55e" }}
                          >✓</span>
                        )}
                        {hasKey && (
                          <button
                            onClick={() => setActiveProv(p.id)}
                            className="text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase transition-all"
                            style={{
                              background: BASE,
                              boxShadow: isActive ? `${nm(false)}, 0 0 8px rgba(200,137,74,0.3)` : nm(),
                              color: isActive ? "#c8894a" : "rgba(255,255,255,0.35)",
                              border: "none",
                            }}
                          >{isActive ? "Active" : "Use"}</button>
                        )}
                        <button
                          onClick={() => window.ghostly.openExternal(p.url)}
                          className="text-[8px] font-bold transition-all opacity-30 hover:opacity-80"
                          style={{ background: "none", border: "none", color: "#c8894a" }}
                        >↗</button>
                        <button
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                          className="text-[8px] transition-all duration-200"
                          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.28)", transform: isOpen ? "rotate(180deg)" : "none" }}
                        >▼</button>
                      </div>

                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="px-2.5 pb-2.5 flex flex-col gap-1.5"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                        >
                          <div className="relative mt-2">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none opacity-50">🔑</span>
                            <input
                              type={showKeys[p.id] ? "text" : "password"}
                              value={aiKeys[p.id] || ""}
                              onChange={e => setAiKeys(k => ({ ...k, [p.id]: e.target.value }))}
                              placeholder={p.ph}
                              className="w-full rounded-[8px] pr-8 py-1.5 text-[10px] font-mono focus:outline-none placeholder:text-white/15"
                              style={{
                                ...nmInput,
                                fontSize: "10px",
                                padding: "6px 32px 6px 28px",
                                boxShadow: hasKey ? `${nm(false)}, 0 0 0 1.5px rgba(34,197,94,0.3)` : nm(false),
                              }}
                            />
                            <button
                              onClick={() => setShowKeys(s => ({ ...s, [p.id]: !s[p.id] }))}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] opacity-40 hover:opacity-80 transition-opacity"
                            >{showKeys[p.id] ? "🙈" : "👁"}</button>
                          </div>
                          {hasKey && (
                            <div className="flex items-center gap-2">
                              <span className="text-[7px] font-bold uppercase shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>Model</span>
                              <select
                                value={selModel[p.id] || p.models[0]}
                                onChange={e => setSelModel(m => ({ ...m, [p.id]: e.target.value }))}
                                className="flex-1 text-[9px] font-semibold rounded-[7px] px-2 py-1 focus:outline-none cursor-pointer"
                                style={{ background: BASE, boxShadow: nm(false), color: "rgba(255,255,255,0.65)", border: "none" }}
                              >
                                {p.models.map(m => (
                                  <option key={m} value={m} style={{ background: BASE }}>{(p as any).modelLabels?.[m] || m}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[7.5px] text-center" style={{ color: "rgba(255,255,255,0.18)" }}>
                OpenAI · Anthropic · Grok — coming soon
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-3 pb-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <motion.button
              whileHover={canProceed ? { scale: 1.02 } : {}}
              whileTap={canProceed ? { scale: 0.97 } : {}}
              onClick={handleSave} disabled={!canProceed}
              className="w-full py-2.5 rounded-[12px] text-[12px] font-extrabold flex items-center justify-center gap-2 transition-all"
              style={{
                background: canProceed ? "linear-gradient(135deg, #c8894a 0%, #b27838 100%)" : BASE,
                color: canProceed ? "#fff" : "rgba(255,255,255,0.2)",
                boxShadow: canProceed
                  ? "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 18px rgba(200,137,74,0.28)"
                  : nm(false),
                border: "none", cursor: canProceed ? "pointer" : "not-allowed",
              }}
            >
              <span className="text-[14px]">{canProceed ? "🎙️" : "🔒"}</span>
              {canProceed ? "Save & Continue →" : "Complete required fields"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
