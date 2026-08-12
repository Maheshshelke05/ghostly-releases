import React, { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { OPENROUTER_FREE_MODELS } from "../lib/ai/openrouter";
import { AudioDiagnostics } from "./AudioDiagnostics";

// action must match a key in electron/hotkeys.ts's ShortcutBindings — these are
// the ones remappable from Settings. "Move Window" stays fixed (4-key group
// doesn't fit a single-combo remap UI) and is shown for reference only.
const REMAPPABLE_SHORTCUTS: { label: string; action: string }[] = [
  { label: "Ask AI",        action: "solve" },
  { label: "Screenshot",    action: "captureAndSolve" },
  { label: "Send to AI",    action: "manualSend" },
  { label: "Next Question", action: "nextQuestion" },
  { label: "Show / Hide",   action: "toggleVisibility" },
  { label: "Start Over",    action: "startOver" },
  { label: "Scroll Up",     action: "prevQuestion" },
  { label: "Scroll Down",   action: "nextQuestionPage" },
];

// Formats an Electron accelerator string ("CommandOrControl+Shift+E") into the
// short display form used elsewhere in this panel ("Ctrl+Shift+E").
function formatAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => (part === "CommandOrControl" ? "Ctrl" : part === "Return" ? "↵" : part))
    .join(" + ");
}

// Builds an accelerator string from a keydown event, or null while the user is
// still only holding modifier keys (caller should keep listening).
function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  const key = e.key;
  if (["Control", "Meta", "Alt", "Shift"].includes(key)) return null;
  if (mods.length === 0) return null; // require at least one modifier — avoids hijacking bare keys system-wide

  const mainKey = key === "Enter" ? "Return" : key.length === 1 ? key.toUpperCase() : key;
  return [...mods, mainKey].join("+");
}

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
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [recordingAction, setRecordingAction] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useEffect(() => {
    window.ghostly.getShortcuts().then(setShortcuts);
  }, []);

  useEffect(() => {
    if (!recordingAction) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") { setRecordingAction(null); return; }
      const accelerator = keyEventToAccelerator(e);
      if (!accelerator) return; // still just modifiers — keep listening
      const action = recordingAction;
      setRecordingAction(null);

      const clash = Object.entries(shortcuts).find(([a, combo]) => a !== action && combo === accelerator);
      if (clash) {
        const clashLabel = REMAPPABLE_SHORTCUTS.find((s) => s.action === clash[0])?.label || clash[0];
        setShortcutError(`"${formatAccelerator(accelerator)}" is already used by "${clashLabel}" — pick a different combo.`);
        return;
      }
      setShortcutError(null);
      const next = { ...shortcuts, [action]: accelerator };
      window.ghostly.updateShortcuts(next).then((result) => {
        if (result.ok) {
          setShortcuts(next);
        } else {
          setShortcutError(`"${formatAccelerator(accelerator)}" couldn't be registered (already in use by another app?)`);
        }
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingAction, shortcuts]);

  const handleResetShortcuts = () => {
    window.ghostly.resetShortcuts().then(() => window.ghostly.getShortcuts().then(setShortcuts));
  };
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
    return () => { clearInterval(iv); window.ghostly.enableMouse(); };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => window.ghostly.saveSettings(settings), 500);
    return () => clearTimeout(t);
  }, [settings]);

  return (
    <div
      className="fixed inset-0 flex justify-center pt-14 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ pointerEvents: "auto", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="rounded-[22px] w-[320px] max-h-[72vh] overflow-y-auto flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(13,13,20,0.96)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.06) inset",
          fontFamily: "'Inter', -apple-system, sans-serif",
          pointerEvents: "auto",
        }}
      >
        {/* Violet accent top bar */}
        <div className="h-0.5 w-full shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.7), rgba(99,102,241,0.5), transparent)" }} />

        <div className="p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[15px]">⚙️</span>
              <span className="text-[14px] font-black tracking-tight" style={{ color: "rgba(255,255,255,0.9)" }}>Settings</span>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[11px] transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.color = "#f87171"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}>
              ✕
            </button>
          </div>

          {/* Active Provider Info */}
          <div className="px-3 py-2.5 rounded-[14px] flex items-center justify-between"
            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(167,139,250,0.7)" }}>Active AI Provider</p>
              <p className="text-[13px] font-extrabold mt-0.5 capitalize" style={{ color: "rgba(255,255,255,0.9)" }}>{settings.activeProvider}</p>
            </div>
            <span className="text-[20px]">🤖</span>
          </div>

          {/* Opacity Slider */}
          <div className="p-3 rounded-[14px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>Window Opacity</span>
              <span className="text-[11px] font-bold font-mono" style={{ color: "#a78bfa" }}>
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
              style={{ accentColor: "#8b5cf6" }}
            />
          </div>

          <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

          {/* Keyboard Shortcuts */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.22)" }}>
                Keyboard Shortcuts
              </p>
              <button onClick={handleResetShortcuts}
                className="text-[9px] font-bold transition-colors" style={{ color: "rgba(255,255,255,0.3)" }}>
                Reset
              </button>
            </div>
            {shortcutError && (
              <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#f87171" }}>{shortcutError}</p>
            )}
            <div className="flex flex-col gap-1">
              {REMAPPABLE_SHORTCUTS.map((s) => {
                const isRecording = recordingAction === s.action;
                return (
                  <div key={s.action} className="flex items-center justify-between py-1.5 px-2 rounded-lg transition-all"
                    style={{ background: isRecording ? "rgba(139,92,246,0.1)" : "transparent" }}
                    onMouseEnter={(e) => { if (!isRecording) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={(e) => { if (!isRecording) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                    <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>{s.label}</span>
                    <button
                      onClick={() => { setShortcutError(null); setRecordingAction(isRecording ? null : s.action); }}
                      className="px-2 py-0.5 rounded-md text-[9px] font-bold font-mono transition-all"
                      style={{
                        background: isRecording ? "rgba(139,92,246,0.25)" : "rgba(139,92,246,0.12)",
                        border: `1px solid ${isRecording ? "rgba(139,92,246,0.6)" : "rgba(139,92,246,0.25)"}`,
                        color: "#a78bfa",
                      }}>
                      {isRecording ? "Press keys… (Esc to cancel)" : formatAccelerator(shortcuts[s.action] || "")}
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between py-1.5 px-2 rounded-lg" style={{ opacity: 0.5 }}>
                <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Move Window</span>
                <kbd className="px-1.5 py-0.5 rounded-md text-[9px] font-bold font-mono"
                  style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}>
                  Ctrl + ↑↓←→
                </kbd>
              </div>
            </div>
          </div>

          <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

          {/* Audio Diagnostics */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-2.5" style={{ color: "rgba(255,255,255,0.22)" }}>
              Audio Diagnostics
            </p>
            <button onClick={() => setShowDiagnostics(true)}
              className="w-full py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.1)"; e.currentTarget.style.borderColor = "rgba(139,92,246,0.25)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}>
              🎙️ Run Audio & Deepgram Test
            </button>
          </div>

          <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

          {/* API Keys */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-3" style={{ color: "rgba(255,255,255,0.22)" }}>
              API Keys
            </p>
            <div className="flex flex-col gap-3">
              {/* Deepgram */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>🎙️ Deepgram</span>
                  <button onClick={() => window.ghostly.openExternal("https://console.deepgram.com/signup")}
                    className="text-[9px] font-bold transition-colors" style={{ color: "rgba(139,92,246,0.7)" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#a78bfa"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "rgba(139,92,246,0.7)"; }}>
                    Get Key ↗
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showKeys["deepgram"] ? "text" : "password"}
                    value={localKeys["deepgram"] || ""}
                    onChange={e => handleKeySave("deepgram", e.target.value)}
                    placeholder="Deepgram API key…"
                    className="w-full rounded-xl px-3 pr-8 py-2 text-[11px] font-mono focus:outline-none transition-all"
                    style={{ border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.8)" }}
                    onFocus={e => { e.currentTarget.style.borderColor = "rgba(139,92,246,0.45)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(139,92,246,0.1)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                  <button onClick={() => setShowKeys(s => ({ ...s, deepgram: !s["deepgram"] }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {showKeys["deepgram"] ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
              {/* AI Providers */}
              {AI_PROVIDERS.map(p => (
                <div key={p.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>{p.label}</span>
                    <button onClick={() => window.ghostly.openExternal(p.url)}
                      className="text-[9px] font-bold transition-colors" style={{ color: "rgba(139,92,246,0.7)" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#a78bfa"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "rgba(139,92,246,0.7)"; }}>
                      Get Key ↗
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showKeys[p.id] ? "text" : "password"}
                      value={localKeys[p.id] || ""}
                      onChange={e => handleKeySave(p.id, e.target.value)}
                      placeholder={p.ph}
                      className="w-full rounded-xl px-3 pr-8 py-2 text-[11px] font-mono focus:outline-none transition-all"
                      style={{ border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.8)" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "rgba(139,92,246,0.45)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(139,92,246,0.1)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                    <button onClick={() => setShowKeys(s => ({ ...s, [p.id]: !s[p.id] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {showKeys[p.id] ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* OpenRouter Model Picker */}
          {localKeys["openrouter"] && (
            <div>
              <div className="h-px mb-4" style={{ background: "rgba(255,255,255,0.07)" }} />
              <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(255,255,255,0.22)" }}>
                🔀 OpenRouter — Free Models
              </p>
              <p className="text-[9px] mb-2.5 font-medium leading-relaxed" style={{ color: "rgba(255,255,255,0.3)" }}>
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
                      className="flex items-center justify-between px-3 py-2.5 rounded-[11px] text-left transition-all"
                      style={{
                        background: isActive ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isActive ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.07)"}`,
                        boxShadow: isActive ? "0 0 12px rgba(139,92,246,0.15)" : "none",
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold leading-tight" style={{ color: isActive ? "#c4b5fd" : "rgba(255,255,255,0.75)" }}>{m.name}</p>
                        <p className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{m.desc} · Free</p>
                      </div>
                      {isActive ? (
                        <span className="shrink-0 text-[9px] font-extrabold ml-2" style={{ color: "#a78bfa" }}>✓ Active</span>
                      ) : (
                        <span className="shrink-0 text-[9px] ml-2" style={{ color: "rgba(255,255,255,0.2)" }}>Select</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {showDiagnostics && <AudioDiagnostics onClose={() => setShowDiagnostics(false)} />}
    </div>
  );
};
