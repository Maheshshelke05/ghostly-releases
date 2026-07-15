import React, { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { OPENROUTER_FREE_MODELS } from "../lib/ai/openrouter";

const SHORTCUTS = [
  { label: "Ask AI",        keys: ["Ctrl", "↵"] },
  { label: "Screenshot",    keys: ["Ctrl", "E"] },
  { label: "Send to AI",    keys: ["Ctrl", "0"] },
  { label: "Next Question", keys: ["Ctrl", "N"] },
  { label: "Show / Hide",   keys: ["Ctrl", "B"] },
  { label: "Start Over",    keys: ["Ctrl", "G"] },
  { label: "Scroll Up",     keys: ["Ctrl", "8"] },
  { label: "Scroll Down",   keys: ["Ctrl", "2"] },
  { label: "Move Window",   keys: ["Ctrl", "↑↓←→"] },
];

const AI_PROVIDERS = [
  { id: "gemini",      label: "Gemini",       ph: "AIza...",       url: "https://aistudio.google.com/app/apikey" },
  { id: "openai",      label: "OpenAI",       ph: "sk-...",        url: "https://platform.openai.com/api-keys" },
  { id: "groq",        label: "Groq",         ph: "gsk_...",       url: "https://console.groq.com/keys" },
  { id: "anthropic",   label: "Anthropic",    ph: "sk-ant-...",    url: "https://console.anthropic.com/settings/keys" },
  { id: "grok",        label: "Grok (xAI)",   ph: "xai-...",       url: "https://console.x.ai/" },
  { id: "openrouter",  label: "OpenRouter",   ph: "sk-or-...",     url: "https://openrouter.ai/keys" },
];

interface SettingsPanelProps { onClose: () => void; }

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { settings, updateSettings, setApiKey } = useStore();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [localKeys, setLocalKeys] = useState<Record<string, string>>(() => {
    const k: Record<string, string> = { deepgram: settings.deepgramApiKey || "" };
    AI_PROVIDERS.forEach(p => { k[p.id] = settings.apiKeys[p.id] || ""; });
    return k;
  });

  const handleKeySave = (id: string, value: string) => {
    setLocalKeys(prev => ({ ...prev, [id]: value }));
    if (id === "deepgram") {
      updateSettings({ deepgramApiKey: value.trim() });
    } else {
      setApiKey(id, value.trim());
    }
    setTimeout(() => window.ghostly.saveSettings(useStore.getState().settings), 200);
  };

  useEffect(() => {
    window.ghostly.enableMouse();
    const iv = setInterval(() => window.ghostly.enableMouse(), 200);
    return () => { clearInterval(iv); window.ghostly.disableMouse(); };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => window.ghostly.saveSettings(settings), 500);
    return () => clearTimeout(t);
  }, [settings]);

  return (
    <div
      className="fixed inset-0 flex justify-center pt-16 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ pointerEvents: "auto" }}
    >
      <div
        className="rounded-2xl w-[320px] max-h-[70vh] overflow-y-auto p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255,255,255,0.8)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25), 0 1px 0 #fff inset",
          fontFamily: "'Inter', -apple-system, sans-serif",
          pointerEvents: "auto",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[15px] font-bold tracking-[-0.3px]" style={{ color: "#0f172a" }}>Settings</span>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[14px] transition-all"
            style={{ background: "#f1f5f9", color: "#64748b" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#e2e8f0"; e.currentTarget.style.color = "#334155"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#64748b"; }}>
            ✕
          </button>
        </div>

        {/* Active Provider Info */}
        <div className="mb-4 px-3 py-2.5 rounded-[12px] flex items-center justify-between"
          style={{ background: "#f0fdf4", border: "1.5px solid #a7f3d0" }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Active AI Provider</p>
            <p className="text-[13px] font-extrabold text-slate-700 mt-0.5 capitalize">{settings.activeProvider}</p>
          </div>
          <span className="text-[20px]">🤖</span>
        </div>

        {/* Opacity Slider */}
        <div className="mb-4 p-3 rounded-[14px]" style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold" style={{ color: "#334155" }}>Window Opacity</span>
            <span className="text-[11px] font-bold font-mono" style={{ color: "#0d9488" }}>
              {Math.round((settings.opacity ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range" min="20" max="100"
            value={Math.round((settings.opacity ?? 1) * 100)}
            onChange={(e) => {
              const v = parseInt(e.target.value) / 100;
              updateSettings({ opacity: v });
              window.ghostly.setOpacity(v);
            }}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "#14b8a6" }}
          />
        </div>

        <div className="h-px mb-4" style={{ background: "#f1f5f9" }} />

        {/* Keyboard Shortcuts */}
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: "#94a3b8" }}>
            Keyboard Shortcuts
          </p>
          <div className="flex flex-col gap-1.5">
            {SHORTCUTS.map((s) => (
              <div key={s.label} className="flex items-center justify-between py-1 px-2 rounded-lg"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = "#f8fafc"}
                onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                <span className="text-[12px] font-medium" style={{ color: "#475569" }}>{s.label}</span>
                <div className="flex items-center gap-1">
                  {s.keys.map((k, i) => (
                    <kbd key={`${k}-${i}`}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono"
                      style={{ background: "#f1f5f9", border: "1.5px solid #e2e8f0", color: "#475569", boxShadow: "0 1px 0 #e2e8f0" }}>
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* API Keys */}
        <div className="mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: "#94a3b8" }}>
            API Keys
          </p>
          <div className="flex flex-col gap-2">
            {/* Deepgram */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500">🎙️ Deepgram</span>
                <button onClick={() => window.ghostly.openExternal("https://console.deepgram.com/signup")}
                  className="text-[9px] font-bold text-indigo-400 hover:text-indigo-600">Get Key ↗</button>
              </div>
              <div className="relative">
                <input
                  type={showKeys["deepgram"] ? "text" : "password"}
                  value={localKeys["deepgram"] || ""}
                  onChange={e => handleKeySave("deepgram", e.target.value)}
                  placeholder="Deepgram API key…"
                  className="w-full rounded-[10px] px-3 pr-8 py-2 text-[11px] font-mono focus:outline-none"
                  style={{ border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#0f172a" }}
                />
                <button onClick={() => setShowKeys(s => ({ ...s, deepgram: !s["deepgram"] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{
                  showKeys["deepgram"] ? "🙈" : "👁"
                }</button>
              </div>
            </div>
            {/* AI Providers */}
            {AI_PROVIDERS.map(p => (
              <div key={p.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-500">{p.label}</span>
                  <button onClick={() => window.ghostly.openExternal(p.url)}
                    className="text-[9px] font-bold text-indigo-400 hover:text-indigo-600">Get Key ↗</button>
                </div>
                <div className="relative">
                  <input
                    type={showKeys[p.id] ? "text" : "password"}
                    value={localKeys[p.id] || ""}
                    onChange={e => handleKeySave(p.id, e.target.value)}
                    placeholder={p.ph}
                    className="w-full rounded-[10px] px-3 pr-8 py-2 text-[11px] font-mono focus:outline-none"
                    style={{ border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#0f172a" }}
                  />
                  <button onClick={() => setShowKeys(s => ({ ...s, [p.id]: !s[p.id] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{
                    showKeys[p.id] ? "🙈" : "👁"
                  }</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── OpenRouter Model Picker ── */}
        {localKeys["openrouter"] && (
          <div className="mt-4">
            <div className="h-px mb-3" style={{ background: "#f1f5f9" }} />
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: "#94a3b8" }}>
              🔀 OpenRouter — Free Models
            </p>
            <p className="text-[9px] text-slate-400 mb-2 font-medium leading-relaxed">
              Select a model → automatically sets OpenRouter as active provider
            </p>
            <div className="flex flex-col gap-1.5">
              {OPENROUTER_FREE_MODELS.map((m) => {
                const isActive = settings.activeProvider === "openrouter" && settings.activeModel === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      updateSettings({ activeProvider: "openrouter", activeModel: m.id });
                      setTimeout(() => window.ghostly.saveSettings(useStore.getState().settings), 200);
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-[10px] text-left transition-all"
                    style={{
                      background: isActive ? "#f0fdf4" : "#f8fafc",
                      border: `1.5px solid ${isActive ? "#86efac" : "#e2e8f0"}`,
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#f1f5f9"; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-slate-700 leading-tight">{m.name}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{m.desc} · Free</p>
                    </div>
                    {isActive ? (
                      <span className="shrink-0 text-[10px] font-extrabold text-emerald-500 ml-2">✓ Active</span>
                    ) : (
                      <span className="shrink-0 text-[9px] text-slate-300 ml-2">Select</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
