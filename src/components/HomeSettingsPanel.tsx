import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore, type Settings } from "../store/useStore";
import { AI_PROVIDERS, testApiKey, type AIProviderConfig } from "../pages/ApiSetupPage";
import { toSyncBadge, type KeySyncBadge } from "../lib/keySync";
import { REMAPPABLE_SHORTCUTS, formatAccelerator, keyEventToAccelerator } from "../lib/shortcuts";
import { isProviderDisabled, withoutDisabled } from "../lib/providerState";
import { AudioDiagnostics } from "./AudioDiagnostics";
import GhostMascot from "./ghost/GhostMascot";

// Light-theme Settings reachable straight from HomePage — API Keys (with a
// per-provider Active switch), Keyboard Shortcuts, and app info in one place a
// user can open any time, without starting an interview first. Reuses the same
// provider list / real key-test / shortcut-remap logic as the setup wizard and
// the in-interview panel (AI_PROVIDERS, testApiKey, REMAPPABLE_SHORTCUTS) so
// there is still exactly one source of truth for those.
//
// The same panel is opened from the live-interview screen's gear button
// (topInset keeps it clear of that screen's top bar), so every setting —
// keys, Active/Off, shortcuts, opacity, audio test — is reachable in both places.
//
// No dimmed backdrop: the window is transparent and click-through everywhere
// except over the card itself, so whatever is underneath stays visible and
// clickable. Esc (or the X) closes it.

const INK = "#15162b";
const SUBTLE = "#6b7280";
const FAINT = "#9ca3af";
const BORDER = "#e8e8ee";
const PANEL_BG = "#f7f7fa";
const ACCENT = "#5b5da8";
const ACCENT_BG = "#f0f0fb";
const ACCENT_BORDER = "#c7c9f0";
const GREEN = "#16a34a";
const GREEN_BG = "#f0fdf4";
const GREEN_BORDER = "#bbf7d0";
const RED = "#dc2626";
const AMBER = "#b45309";

type TestState = { status: "idle" | "testing" | "valid" | "invalid"; message?: string };
type ProviderState = "active" | "ready" | "off" | "empty";
type Tab = "keys" | "shortcuts" | "more";

/* ─── Small building blocks ─── */

function Spinner({ size = 12, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <span
      className="inline-block rounded-full animate-spin shrink-0"
      style={{ width: size, height: size, border: `2px solid ${color}40`, borderTopColor: color }}
    />
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

function CloseIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PulseDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: color }} />
    </span>
  );
}

function StatusChip({ state }: { state: ProviderState }) {
  const map: Record<ProviderState, { label: string; color: string; bg: string; border: string }> = {
    active: { label: "Active", color: GREEN, bg: GREEN_BG, border: GREEN_BORDER },
    ready:  { label: "Ready",  color: ACCENT, bg: ACCENT_BG, border: ACCENT_BORDER },
    off:    { label: "Off",    color: SUBTLE, bg: "#f3f4f6", border: "#e5e7eb" },
    empty:  { label: "No key", color: FAINT, bg: "transparent", border: BORDER },
  };
  const s = map[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[9px] font-black uppercase tracking-wider shrink-0"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {state === "active" && <PulseDot color={GREEN} />}
      {s.label}
    </span>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative w-9 h-5 rounded-full shrink-0 transition-colors duration-200"
      style={{ background: on ? GREEN : "#d1d5db" }}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}
        animate={{ x: on ? 16 : 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
      />
    </button>
  );
}

// Every key of a combo as its own keycap, e.g. "Ctrl + Shift + E" → [Ctrl][Shift][E].
function Keycaps({ combo, dim }: { combo: string; dim?: boolean }) {
  const parts = formatAccelerator(combo).split(" + ").filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1" style={{ opacity: dim ? 0.55 : 1 }}>
      {parts.map((k, i) => (
        <kbd
          key={i}
          className="min-w-[24px] h-[24px] px-1.5 rounded-[7px] text-[10px] font-bold font-mono inline-flex items-center justify-center"
          style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderBottomWidth: 2, color: INK }}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <span className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: FAINT }}>{children}</span>
      {right}
    </div>
  );
}

function ResultLine({ test, okHint }: { test: TestState; okHint?: string }) {
  return (
    <AnimatePresence initial={false}>
      {(test.status === "testing" || test.status === "valid" || test.status === "invalid") && (
        <motion.div
          key={test.status}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-start gap-1.5 text-[10px] font-bold leading-snug"
          style={{ color: test.status === "valid" ? GREEN : test.status === "invalid" ? RED : SUBTLE }}
        >
          {test.status === "testing" ? (
            <><Spinner size={10} /> <span>Testing key…</span></>
          ) : test.status === "valid" ? (
            <><span>✓</span> <span>{test.message || "Key is valid"}{okHint ? ` — ${okHint}` : ""}</span></>
          ) : (
            <><span>✕</span> <span>{test.message || "Key didn't work"}</span></>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// "☁ Saved to your account" (green) / "☁ Couldn't back up…" (amber) under a Test result — pressing Test
// also saves the key to the user's account (lib/keySync.ts). Renders nothing when there is nothing to
// say (not signed in, still in flight…), so the Test row layout is never disturbed.
function SyncNote({ badge }: { badge?: KeySyncBadge }) {
  if (!badge) return null;
  return (
    <p
      role="status"
      title={badge.hint}
      className="text-[9.5px] font-semibold leading-snug px-0.5 -mt-1.5"
      style={{ color: badge.kind === "saved" ? GREEN : AMBER }}
    >
      {badge.kind === "saved" ? "☁ Saved to your account" : "☁ Couldn't back up (will retry on next test)"}
    </p>
  );
}

// Inline (not a native <select>): a native popup is a separate OS widget, which
// fights with this window's click-through toggling when the pointer moves onto it.
function ModelPicker({ provider, value, onChange }: { provider: AIProviderConfig; value: string; onChange: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const label = provider.modelLabels[value] || value;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 rounded-xl px-3 h-9 text-[10.5px] font-semibold transition-colors"
        style={{ background: "#fff", border: `1px solid ${open ? ACCENT_BORDER : BORDER}`, color: INK }}
      >
        <span className="truncate text-left"><span style={{ color: FAINT }}>Model · </span>{label}</span>
        <span style={{ color: FAINT }}><Chevron open={open} /></span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 rounded-xl p-1 max-h-[148px] overflow-y-auto" style={{ background: "#fff", border: `1px solid ${BORDER}`, scrollbarWidth: "thin" }}>
              {provider.models.map((m) => {
                const sel = m === value;
                return (
                  <button
                    key={m}
                    onClick={() => { onChange(m); setOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-lg text-[10.5px] font-semibold transition-colors hover:bg-[#f7f7fa]"
                    style={{ color: sel ? ACCENT : INK, background: sel ? ACCENT_BG : undefined }}
                  >
                    <span className="truncate">{provider.modelLabels[m] || m}</span>
                    {sel && <span className="shrink-0">✓</span>}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── One AI provider ─── */

interface ProviderCardProps {
  p: AIProviderConfig;
  state: ProviderState;
  isOpen: boolean;
  onToggle: () => void;
  apiKey: string;
  showKey: boolean;
  onToggleShow: () => void;
  onKeyChange: (v: string) => void;
  model: string;
  onModelChange: (m: string) => void;
  test: TestState;
  sync?: KeySyncBadge;
  onTest: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  p, state, isOpen, onToggle, apiKey, showKey, onToggleShow, onKeyChange, model, onModelChange, test, sync, onTest, onActivate, onDeactivate,
}) => {
  const hasKey = state !== "empty";
  const [nudge, setNudge] = useState(false);
  const lastActivatedAt = useRef(0);

  // Single click activates. Once active, a single click only reminds how to
  // deactivate; a double-click deactivates. The two clicks of a double-click
  // that ACTIVATED a provider must not immediately deactivate it again.
  const handleActiveClick = () => {
    if (!hasKey) return;
    if (state === "active") {
      if (Date.now() - lastActivatedAt.current < 500) return; // 2nd click of a double-click that just activated it
      setNudge(true);
      window.setTimeout(() => setNudge(false), 1800);
      return;
    }
    lastActivatedAt.current = Date.now();
    onActivate();
  };
  const handleActiveDouble = () => {
    if (state !== "active") return;
    if (Date.now() - lastActivatedAt.current < 500) return;
    setNudge(false);
    onDeactivate();
  };

  const subline =
    state === "active" ? (p.modelLabels[model] || model)
    : state === "ready" ? "Key saved · press Activate to use it"
    : state === "off" ? "Deactivated — not used for answers"
    : "Add your API key";

  const cardStyle: React.CSSProperties =
    state === "active" ? { background: "linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)", border: `1px solid ${GREEN_BORDER}`, boxShadow: "0 4px 14px rgba(22,163,74,0.10)" }
    : state === "off" ? { background: "#fbfbfc", border: `1px dashed #d1d5db` }
    : { background: PANEL_BG, border: `1px solid ${BORDER}` };

  const hint =
    nudge ? { text: "Double-click Active to deactivate this provider", color: AMBER }
    : state === "active" ? { text: "Answering with this key · double-click Active to deactivate", color: GREEN }
    : state === "ready" ? { text: "Press Activate to use this key for AI answers", color: SUBTLE }
    : state === "off" ? { text: "Deactivated — press Activate to turn it back on", color: SUBTLE }
    : { text: "Paste your key to enable Test and Activate", color: FAINT };

  return (
    <div className="rounded-2xl overflow-hidden transition-shadow" style={cardStyle}>
      <button onClick={onToggle} aria-expanded={isOpen} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left outline-none">
        <span
          className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[15px] shrink-0"
          style={{ background: "#ffffff", border: `1px solid ${state === "active" ? GREEN_BORDER : BORDER}`, opacity: state === "off" ? 0.6 : 1 }}
        >{p.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[12px] font-bold truncate" style={{ color: state === "off" ? SUBTLE : INK }}>{p.label}</span>
            <span className="text-[8px] font-black px-1.5 py-[1px] rounded-full shrink-0" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: FAINT }}>{p.badge}</span>
          </span>
          <span className="block text-[10px] font-medium truncate mt-0.5" style={{ color: state === "active" ? GREEN : FAINT }}>{subline}</span>
        </span>
        <StatusChip state={state} />
        <span className="shrink-0" style={{ color: FAINT }}><Chevron open={isOpen} /></span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-2.5 flex flex-col gap-2.5" style={{ borderTop: `1px solid ${state === "active" ? GREEN_BORDER : BORDER}` }}>
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: FAINT }}>API key</span>
                <button onClick={() => window.ghostly.openExternal(p.url)} className="text-[9.5px] font-bold hover:underline" style={{ color: ACCENT }}>Get key ↗</button>
              </div>

              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => onKeyChange(e.target.value)}
                  placeholder={p.ph}
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full h-9 rounded-xl pl-3 pr-16 text-[11px] font-mono outline-none transition-all focus:shadow-[0_0_0_3px_rgba(91,93,168,0.12)]"
                  style={{
                    background: "#fff", color: INK,
                    border: `1px solid ${test.status === "valid" ? GREEN_BORDER : test.status === "invalid" ? "#fecaca" : hasKey ? GREEN_BORDER : BORDER}`,
                  }}
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
                  {apiKey && (
                    <button onClick={() => onKeyChange("")} aria-label="Remove key" title="Remove key" className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[#f3f4f6]" style={{ color: FAINT }}>
                      <CloseIcon size={9} />
                    </button>
                  )}
                  <button onClick={onToggleShow} aria-label={showKey ? "Hide key" : "Show key"} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[#f3f4f6]" style={{ color: SUBTLE }}>
                    <EyeIcon off={showKey} />
                  </button>
                </div>
              </div>

              {/* Test + Active side by side */}
              <div className="grid grid-cols-2 gap-2">
                <motion.button
                  whileTap={hasKey ? { scale: 0.97 } : undefined}
                  onClick={onTest}
                  disabled={!hasKey || test.status === "testing"}
                  className="h-9 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-opacity"
                  style={{ background: INK, color: "#fff", opacity: hasKey ? 1 : 0.35, cursor: hasKey ? "pointer" : "not-allowed" }}
                >
                  {test.status === "testing" ? <><Spinner size={11} color="#fff" /> Testing</> : "Test"}
                </motion.button>

                <motion.button
                  whileTap={hasKey ? { scale: 0.97 } : undefined}
                  onClick={handleActiveClick}
                  onDoubleClick={handleActiveDouble}
                  disabled={!hasKey}
                  title={state === "active" ? "Double-click to deactivate" : "Use this key for AI answers"}
                  className="h-9 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 select-none transition-colors"
                  style={
                    state === "active"
                      ? { background: GREEN, color: "#fff", border: `1px solid ${GREEN}`, boxShadow: "0 4px 12px rgba(22,163,74,0.28)" }
                      : { background: "#fff", color: INK, border: `1.5px solid ${hasKey ? INK : BORDER}`, opacity: hasKey ? 1 : 0.35, cursor: hasKey ? "pointer" : "not-allowed" }
                  }
                >
                  {state === "active" ? <><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Active</> : "Activate"}
                </motion.button>
              </div>

              <ResultLine test={test} okHint={state === "active" ? undefined : "press Activate to use it"} />
              <SyncNote badge={sync} />

              <p className="text-[9.5px] font-semibold leading-snug px-0.5 transition-colors" style={{ color: hint.color }}>{hint.text}</p>

              {hasKey && <ModelPicker provider={p} value={model} onChange={onModelChange} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─── Panel ─── */

interface HomeSettingsPanelProps {
  onClose: () => void;
  // Pixels reserved above the card (the interview screen's top bar).
  topInset?: number;
}

export const HomeSettingsPanel: React.FC<HomeSettingsPanelProps> = ({ onClose, topInset = 0 }) => {
  const { settings, updateSettings } = useStore();
  const [tab, setTab] = useState<Tab>("keys");
  // The exit animation lives here (not in an outer AnimatePresence): with the
  // tab switcher's own AnimatePresence nested inside, a parent-driven exit could
  // hang after switching tabs and leave an invisible card that still grabbed the
  // mouse. onClose (which unmounts us) only fires once the fade-out has played.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [tab]);
  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(onClose, 350);
    return () => window.clearTimeout(t);
  }, [closing, onClose]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [checkStatus, setCheckStatus] = useState<"idle" | "checking" | "latest">("idle");
  const version = window.ghostly.getVersion();

  const handleCheckUpdate = () => {
    setCheckStatus("checking");
    window.ghostly.checkForUpdates();
    setTimeout(() => setCheckStatus((s) => (s === "checking" ? "latest" : s)), 8000);
  };

  // Debounced save (the old panel saved on every keystroke); a pending save is
  // flushed when the panel closes so nothing typed is ever lost.
  const saveTimer = useRef<number | undefined>(undefined);
  const persist = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      window.ghostly.saveSettings(useStore.getState().settings);
    }, 250);
  };
  useEffect(() => () => {
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current);
      window.ghostly.saveSettings(useStore.getState().settings);
    }
  }, []);

  // ── API Keys state ──────────────────────────────────────────────────────
  const [deepgram, setDeepgram] = useState(settings.deepgramApiKey || "");
  const [aiKeys, setAiKeys] = useState<Record<string, string>>(() => {
    const k: Record<string, string> = {};
    AI_PROVIDERS.forEach((p) => { k[p.id] = settings.apiKeys[p.id] || ""; });
    return k;
  });
  const [selModel, setSelModel] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    AI_PROVIDERS.forEach((p) => { m[p.id] = p.models[0]; });
    const curP = AI_PROVIDERS.find((p) => p.id === settings.activeProvider);
    if (curP?.models.includes(settings.activeModel)) m[settings.activeProvider] = settings.activeModel;
    return m;
  });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, TestState>>({});
  // How the background "save to your account" went for each provider's latest Test. testSeq numbers the
  // Tests per provider so a late answer to an older Test (or to a key that has since been edited) can't
  // overwrite what the indicator shows now.
  const [syncBadge, setSyncBadge] = useState<Record<string, KeySyncBadge | undefined>>({});
  const testSeq = useRef<Record<string, number>>({});
  const invalidateSync = (providerId: string) => {
    const seq = (testSeq.current[providerId] = (testSeq.current[providerId] || 0) + 1);
    setSyncBadge((prev) => (prev[providerId] ? { ...prev, [providerId]: undefined } : prev));
    return seq;
  };

  const runTest = async (providerId: string, apiKey: string) => {
    if (!apiKey.trim()) {
      setTestStatus((prev) => ({ ...prev, [providerId]: { status: "invalid", message: "Enter an API key first" } }));
      return;
    }
    const seq = invalidateSync(providerId);
    setTestStatus((prev) => ({ ...prev, [providerId]: { status: "testing" } }));
    const result = await testApiKey(providerId, apiKey, selModel[providerId], (synced) => {
      if (testSeq.current[providerId] !== seq) return;
      setSyncBadge((prev) => ({ ...prev, [providerId]: toSyncBadge(synced) ?? undefined }));
    });
    setTestStatus((prev) => ({ ...prev, [providerId]: result }));
  };

  const onDeepgramChange = (v: string) => {
    setDeepgram(v);
    invalidateSync("deepgram");
    setTestStatus((prev) => ({ ...prev, deepgram: { status: "idle" } }));
    updateSettings({ deepgramApiKey: v.trim() });
    persist();
  };

  const activate = (id: string) => {
    const st = useStore.getState().settings;
    updateSettings({
      activeProvider: id as Settings["activeProvider"],
      activeModel: selModel[id] || AI_PROVIDERS.find((p) => p.id === id)?.models[0] || st.activeModel,
      disabledProviders: withoutDisabled(st, id),
    });
    persist();
  };

  const deactivate = (id: string) => {
    const st = useStore.getState().settings;
    updateSettings({ disabledProviders: Array.from(new Set([...(st.disabledProviders || []), id])) });
    persist();
  };

  const onKeyChange = (id: string, v: string) => {
    setAiKeys((prev) => ({ ...prev, [id]: v }));
    invalidateSync(id);
    setTestStatus((prev) => ({ ...prev, [id]: { status: "idle" } }));
    const st = useStore.getState().settings;
    const trimmed = v.trim();
    const patch: Partial<Settings> = { apiKeys: { ...st.apiKeys, [id]: trimmed } };
    // If nothing usable is answering yet (the chosen provider has no key and
    // wasn't deliberately deactivated), the first key you add takes over so a
    // fresh setup works without a separate Activate press. Never switches away
    // from a provider that already has a key.
    const activeHasKey = !!st.apiKeys[st.activeProvider]?.trim();
    if (trimmed && !activeHasKey && id !== st.activeProvider && !isProviderDisabled(st, st.activeProvider)) {
      patch.activeProvider = id as Settings["activeProvider"];
      patch.activeModel = selModel[id] || AI_PROVIDERS.find((p) => p.id === id)?.models[0] || st.activeModel;
      patch.disabledProviders = withoutDisabled(st, id);
    }
    updateSettings(patch);
    persist();
  };

  const onModelChange = (id: string, m: string) => {
    setSelModel((prev) => ({ ...prev, [id]: m }));
    if (id === useStore.getState().settings.activeProvider) updateSettings({ activeModel: m });
    persist();
  };

  const stateOf = (p: AIProviderConfig): ProviderState => {
    if (!aiKeys[p.id]?.trim()) return "empty";
    if (isProviderDisabled(settings, p.id)) return "off";
    return settings.activeProvider === p.id ? "active" : "ready";
  };

  const activeP = AI_PROVIDERS.find((p) => p.id === settings.activeProvider);
  const activeState = activeP ? stateOf(activeP) : "empty";
  const addedCount = AI_PROVIDERS.filter((p) => aiKeys[p.id]?.trim()).length;
  const hasReady = AI_PROVIDERS.some((p) => stateOf(p) === "ready");

  // ── Shortcuts state ─────────────────────────────────────────────────────
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [recordingAction, setRecordingAction] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => { window.ghostly.getShortcuts().then(setShortcuts); }, []);

  useEffect(() => {
    if (!recordingAction) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") { setRecordingAction(null); return; }
      const accelerator = keyEventToAccelerator(e);
      if (!accelerator) return;
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
        if (result.ok) setShortcuts(next);
        else setShortcutError(`"${formatAccelerator(accelerator)}" couldn't be registered (already in use by another app?)`);
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingAction, shortcuts]);

  const handleResetShortcuts = () => {
    window.ghostly.resetShortcuts().then(() => window.ghostly.getShortcuts().then((s) => {
      setShortcuts(s);
      setShortcutError(null);
      setResetDone(true);
      window.setTimeout(() => setResetDone(false), 1800);
    }));
  };

  // Esc closes — except while a shortcut is being recorded (that handler owns
  // Esc and has already called preventDefault on it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !recordingAction) requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recordingAction]);

  // Mouse capture only while the pointer is over the card; everywhere else the
  // (transparent) window lets clicks fall through to whatever is underneath.
  useEffect(() => {
    window.ghostly.enableMouse();
    return () => { window.ghostly.enableMouse(); };
  }, []);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "keys", label: "API Keys", icon: "🔑" },
    { id: "shortcuts", label: "Shortcuts", icon: "⌨️" },
    { id: "more", label: "More", icon: "✨" },
  ];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[999] p-4"
      style={{ pointerEvents: "none", paddingTop: 16 + topInset, fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={closing ? { opacity: 0, y: 10, scale: 0.97 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: closing ? 0.18 : 0.28, ease: [0.16, 1, 0.3, 1] }}
        onAnimationComplete={() => { if (closing) onClose(); }}
        role="dialog"
        aria-label="Settings"
        onMouseEnter={() => window.ghostly.enableMouse()}
        onMouseLeave={() => window.ghostly.disableMouse()}
        className="w-full max-w-[400px] flex flex-col"
        style={{
          pointerEvents: closing ? "none" : "auto",
          maxHeight: topInset ? `calc(100vh - ${32 + topInset}px)` : "88vh",
          background: "#ffffff",
          borderRadius: "24px",
          border: `1px solid ${BORDER}`,
          boxShadow: "0 28px 70px rgba(20,20,40,0.30), 0 2px 8px rgba(20,20,40,0.08)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[15px]" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>⚙️</span>
            <div>
              <p className="text-[14px] font-bold leading-tight" style={{ color: INK }}>Settings</p>
              <p className="text-[10px] font-semibold mt-0.5" style={{ color: FAINT }}>Keys, shortcuts &amp; app info</p>
            </div>
          </div>
          <button
            onClick={requestClose}
            aria-label="Close settings"
            title="Close (Esc)"
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-white"
            style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, color: SUBTLE }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pb-3 shrink-0">
          <div className="relative flex p-1 rounded-2xl" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
            {tabs.map((t) => {
              const sel = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="relative flex-1 h-8 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 outline-none"
                  style={{ color: sel ? "#fff" : SUBTLE }}
                >
                  {sel && (
                    <motion.span
                      layoutId="settings-tab-pill"
                      className="absolute inset-0 rounded-xl"
                      style={{ background: INK, boxShadow: "0 4px 12px rgba(21,22,43,0.25)" }}
                      transition={{ type: "spring", stiffness: 480, damping: 36 }}
                    />
                  )}
                  <span className="relative text-[11px]">{t.icon}</span>
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="px-5 pb-5 flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}>
          <AnimatePresence mode="wait" initial={false}>
            {tab === "keys" ? (
              <motion.div key="keys" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="flex flex-col gap-4">
                {/* Who is answering right now */}
                {activeState === "active" && activeP ? (
                  <div className="rounded-2xl px-3.5 py-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)", border: `1px solid ${GREEN_BORDER}` }}>
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0" style={{ background: "#fff", border: `1px solid ${GREEN_BORDER}` }}>{activeP.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] flex items-center gap-1.5" style={{ color: GREEN }}><PulseDot color={GREEN} /> AI answers use</p>
                      <p className="text-[13px] font-extrabold truncate mt-0.5" style={{ color: INK }}>{activeP.label}</p>
                      <p className="text-[10px] font-medium truncate" style={{ color: SUBTLE }}>{activeP.modelLabels[settings.activeModel] || settings.activeModel}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl px-3.5 py-3 flex items-start gap-3" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0" style={{ background: "#fff", border: "1px solid #fde68a" }}>⚠️</span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold" style={{ color: AMBER }}>No active AI provider</p>
                      <p className="text-[10.5px] font-medium leading-snug mt-0.5" style={{ color: "#92400e" }}>
                        {activeState === "off" && activeP
                          ? `${activeP.label} is deactivated, so AI answers are paused. `
                          : "AI answers need an active provider. "}
                        {hasReady ? "Open a provider below and press Activate." : "Add an API key below, then press Activate."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Pressing Test also saves the key to the user's account (lib/keySync.ts) — say so up front. */}
                <p className="text-[10px] font-medium leading-snug px-0.5 -my-1" style={{ color: SUBTLE, userSelect: "text" }}>
                  🔒 When you press Test, the key is saved (encrypted) to your Ghotly AI account. Email{" "}
                  <button onClick={() => window.ghostly.openExternal("mailto:support@ghotlyai.in")} className="font-bold hover:underline" style={{ color: ACCENT }}>support@ghotlyai.in</button>{" "}
                  to have it deleted.
                </p>

                {/* Deepgram */}
                <div className="flex flex-col gap-2">
                  <SectionLabel right={<button onClick={() => window.ghostly.openExternal("https://console.deepgram.com/signup")} className="text-[9.5px] font-bold hover:underline" style={{ color: ACCENT }}>Get key ↗</button>}>
                    🎙️ Deepgram · speech-to-text
                  </SectionLabel>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKeys.deepgram ? "text" : "password"}
                        value={deepgram}
                        onChange={(e) => onDeepgramChange(e.target.value)}
                        placeholder="Paste Deepgram API key…"
                        spellCheck={false}
                        autoComplete="off"
                        className="w-full h-9 rounded-xl pl-3 pr-9 text-[11px] font-mono outline-none transition-all focus:bg-white focus:shadow-[0_0_0_3px_rgba(91,93,168,0.12)]"
                        style={{
                          background: PANEL_BG, color: INK,
                          border: `1px solid ${testStatus.deepgram?.status === "valid" ? GREEN_BORDER : testStatus.deepgram?.status === "invalid" ? "#fecaca" : BORDER}`,
                        }}
                      />
                      <button
                        onClick={() => setShowKeys((s) => ({ ...s, deepgram: !s.deepgram }))}
                        aria-label={showKeys.deepgram ? "Hide key" : "Show key"}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md hover:bg-[#f3f4f6]"
                        style={{ color: SUBTLE }}
                      >
                        <EyeIcon off={!!showKeys.deepgram} />
                      </button>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => runTest("deepgram", deepgram)}
                      disabled={!deepgram.trim() || testStatus.deepgram?.status === "testing"}
                      className="h-9 px-4 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 shrink-0 transition-opacity"
                      style={{ background: INK, color: "#fff", opacity: deepgram.trim() ? 1 : 0.35, cursor: deepgram.trim() ? "pointer" : "not-allowed" }}
                    >
                      {testStatus.deepgram?.status === "testing" ? <><Spinner size={11} color="#fff" /> Testing</> : "Test"}
                    </motion.button>
                  </div>
                  <ResultLine test={testStatus.deepgram || { status: "idle" }} />
                  <SyncNote badge={syncBadge.deepgram} />
                  {!deepgram.trim() && <p className="text-[9.5px] font-semibold px-0.5" style={{ color: AMBER }}>Required — live transcription can't start without it.</p>}
                  {/* Interviewer mixing Hindi/another language with English? Deepgram's
                      default only transcribes English well; this opts into another
                      language or code-switching ("multi") without changing the default. */}
                  <input
                    type="text"
                    value={settings.deepgramLanguage || ""}
                    onChange={(e) => { updateSettings({ deepgramLanguage: e.target.value.trim() }); persist(); }}
                    placeholder="Language code (optional) — e.g. multi, hi, en"
                    spellCheck={false}
                    className="w-full h-8 rounded-xl px-3 text-[10px] font-mono outline-none transition-all focus:bg-white focus:shadow-[0_0_0_3px_rgba(91,93,168,0.12)]"
                    style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, color: INK }}
                  />
                  <p className="text-[9px] font-medium leading-snug px-0.5" style={{ color: FAINT }}>
                    Blank = English. For Hindi + English interviews try <b>multi</b> (needs Deepgram plan support).
                  </p>
                </div>

                {/* AI providers */}
                <div className="flex flex-col gap-2">
                  <SectionLabel right={<span className="text-[9.5px] font-bold" style={{ color: addedCount ? GREEN : FAINT }}>{addedCount}/{AI_PROVIDERS.length} added</span>}>
                    🤖 AI providers
                  </SectionLabel>
                  {AI_PROVIDERS.map((p) => (
                    <ProviderCard
                      key={p.id}
                      p={p}
                      state={stateOf(p)}
                      isOpen={expanded === p.id}
                      onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                      apiKey={aiKeys[p.id] || ""}
                      showKey={!!showKeys[p.id]}
                      onToggleShow={() => setShowKeys((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      onKeyChange={(v) => onKeyChange(p.id, v)}
                      model={selModel[p.id] || p.models[0]}
                      onModelChange={(m) => onModelChange(p.id, m)}
                      test={testStatus[p.id] || { status: "idle" }}
                      sync={syncBadge[p.id]}
                      onTest={() => runTest(p.id, aiKeys[p.id] || "")}
                      onActivate={() => activate(p.id)}
                      onDeactivate={() => deactivate(p.id)}
                    />
                  ))}

                  {/* Auto-switch: only ever uses providers that are Ready (Off ones are excluded). */}
                  <div className="rounded-2xl px-3.5 py-3 flex items-center gap-3 mt-1" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold" style={{ color: INK }}>Auto-switch on rate limit</p>
                      <p className="text-[9.5px] font-medium leading-snug mt-0.5" style={{ color: FAINT }}>
                        If the active provider hits its limit, that one answer is retried with another <b>Ready</b> provider. Off providers are never used.
                      </p>
                    </div>
                    <Switch
                      on={settings.autoSwitchProvider ?? true}
                      label="Auto-switch on rate limit"
                      onChange={(v) => { updateSettings({ autoSwitchProvider: v }); persist(); }}
                    />
                  </div>
                </div>
              </motion.div>
            ) : tab === "shortcuts" ? (
              <motion.div key="shortcuts" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="flex flex-col gap-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10.5px] font-medium leading-snug" style={{ color: SUBTLE }}>
                    Click a shortcut, then press the new keys. <b style={{ color: INK }}>Esc</b> cancels.
                  </p>
                  <button
                    onClick={handleResetShortcuts}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors shrink-0 ml-3"
                    style={{ background: resetDone ? GREEN_BG : PANEL_BG, border: `1px solid ${resetDone ? GREEN_BORDER : BORDER}`, color: resetDone ? GREEN : INK }}
                  >
                    {resetDone ? "✓ Reset" : "Reset all"}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {shortcutError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-[10px] font-semibold leading-snug" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: RED }}>
                        <span>⚠️</span><span className="flex-1">{shortcutError}</span>
                        <button onClick={() => setShortcutError(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><CloseIcon size={9} /></button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {REMAPPABLE_SHORTCUTS.map((s) => {
                  const isRecording = recordingAction === s.action;
                  return (
                    <button
                      key={s.action}
                      onClick={() => { setShortcutError(null); setRecordingAction(isRecording ? null : s.action); }}
                      className="w-full flex items-center justify-between gap-3 px-3.5 h-11 rounded-2xl text-left transition-all outline-none hover:bg-white"
                      style={{
                        background: isRecording ? ACCENT_BG : PANEL_BG,
                        border: `1px solid ${isRecording ? ACCENT_BORDER : BORDER}`,
                        boxShadow: isRecording ? "0 0 0 3px rgba(91,93,168,0.10)" : "none",
                      }}
                    >
                      <span className="text-[11.5px] font-semibold" style={{ color: INK }}>{s.label}</span>
                      {isRecording ? (
                        <span className="inline-flex items-center gap-2 text-[10px] font-bold" style={{ color: ACCENT }}>
                          <PulseDot color={ACCENT} /> Press keys…
                        </span>
                      ) : (
                        <Keycaps combo={shortcuts[s.action] || ""} />
                      )}
                    </button>
                  );
                })}

                <div className="flex items-center justify-between gap-3 px-3.5 h-11 rounded-2xl" style={{ border: `1px dashed ${BORDER}` }}>
                  <span className="text-[11.5px] font-semibold flex items-center gap-1.5" style={{ color: SUBTLE }}>
                    Move Window <span className="text-[10px]" title="Fixed">🔒</span>
                  </span>
                  <Keycaps combo="CommandOrControl+↑↓←→" dim />
                </div>
              </motion.div>
            ) : (
              <motion.div key="more" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="flex flex-col gap-3">
                <div className="rounded-2xl p-4 flex items-center gap-3.5" style={{ background: "linear-gradient(135deg, #f0f0fb 0%, #ffffff 100%)", border: `1px solid ${ACCENT_BORDER}` }}>
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "#fff", border: `1px solid ${ACCENT_BORDER}` }}><GhostMascot size={46} variant="idle" alt="" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-extrabold" style={{ color: INK }}>Ghotly AI</p>
                    <p className="text-[10.5px] font-semibold mt-0.5" style={{ color: SUBTLE }}>Version {version}</p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCheckUpdate}
                    disabled={checkStatus === "checking"}
                    className="h-9 px-3.5 rounded-xl text-[10.5px] font-extrabold flex items-center gap-1.5 shrink-0 transition-colors"
                    style={
                      checkStatus === "latest"
                        ? { background: GREEN_BG, border: `1px solid ${GREEN_BORDER}`, color: GREEN }
                        : { background: INK, border: `1px solid ${INK}`, color: "#fff" }
                    }
                  >
                    {checkStatus === "checking" ? <><Spinner size={11} color="#fff" /> Checking</> : checkStatus === "latest" ? "✓ Up to date" : "Check for updates"}
                  </motion.button>
                </div>

                <div className="rounded-2xl px-3.5 py-3" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] font-bold" style={{ color: INK }}>🪟 Window opacity</span>
                    <span className="text-[11px] font-bold font-mono" style={{ color: ACCENT }}>{Math.round((settings.opacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range" min="20" max="100"
                    value={Math.round((settings.opacity ?? 1) * 100)}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) / 100;
                      updateSettings({ opacity: v });
                      window.ghostly.setOpacity(v);
                      persist();
                    }}
                    className="w-full h-1.5 rounded-full cursor-pointer"
                    style={{ accentColor: ACCENT }}
                  />
                </div>

                <button
                  onClick={() => setShowDiagnostics(true)}
                  className="w-full flex items-center gap-3 px-3.5 h-14 rounded-2xl text-left transition-all outline-none hover:bg-white hover:shadow-[0_6px_18px_rgba(109,111,176,0.12)] group"
                  style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[15px] shrink-0" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>🎙️</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-bold" style={{ color: INK }}>Audio &amp; Deepgram test</span>
                    <span className="block text-[10px] font-medium truncate" style={{ color: FAINT }}>Check that interview audio is being captured</span>
                  </span>
                  <span className="text-[12px] opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" style={{ color: ACCENT }}>›</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      {showDiagnostics && <AudioDiagnostics onClose={() => setShowDiagnostics(false)} />}
    </div>
  );
};
