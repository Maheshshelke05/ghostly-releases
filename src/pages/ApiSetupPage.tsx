import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store/useStore";
import type { ProviderName } from "../lib/ai";
import { NVIDIA_MODELS } from "../lib/ai/nvidia";
import { OPENROUTER_FREE_MODELS } from "../lib/ai/openrouter";
import { withoutDisabled } from "../lib/providerState";
import { syncApiKey, toSyncBadge, type KeySyncBadge, type KeySyncResult } from "../lib/keySync";

export interface AIProviderConfig {
  id: ProviderName;
  label: string;
  icon: string;
  badge: string;
  badgeColor: string;
  badgeBorder: string;
  badgeText: string;
  url: string;
  ph: string;
  models: string[];
  modelLabels: Record<string, string>;
}

// Explicitly typed as ProviderName[] — without this, `id` widens to plain
// `string`, which meant `setActiveProv(p.id)` calls below didn't actually
// type-check against the store's ProviderName union (caught by `tsc`, not by
// `vite build`, so it silently worked at runtime but wasn't real type safety).
export const AI_PROVIDERS: AIProviderConfig[] = [
  {
    id: "groq", label: "Groq", icon: "⚡", badge: "FAST", badgeColor: "rgba(139,92,246,0.15)", badgeBorder: "rgba(139,92,246,0.3)", badgeText: "#a78bfa",
    url: "https://console.groq.com/keys", ph: "gsk_…",
    // Llama 4 Scout was removed from Groq's catalog (production and preview) and was
    // erroring "model does not exist" for every user — do not re-add it. Groq has no
    // vision model right now, so all options here are text-only.
    // llama-3.3-70b-versatile / llama-3.1-8b-instant shut down 08/16/26 (Groq's
    // own deprecation schedule) — removed rather than left in to start failing.
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
    modelLabels: { "openai/gpt-oss-120b": "GPT-OSS 120B — FREE", "openai/gpt-oss-20b": "GPT-OSS 20B — FREE + FAST" },
  },
  {
    id: "gemini", label: "Gemini", icon: "🔵", badge: "FREE", badgeColor: "rgba(59,130,246,0.12)", badgeBorder: "rgba(59,130,246,0.3)", badgeText: "#60a5fa",
    url: "https://aistudio.google.com/app/apikey", ph: "AIza…",
    // gemini-2.5-flash/2.5-pro/2.0-flash all 404 ("no longer available to
    // new users") on a current "AQ."-format key — verified live. Only ship
    // model IDs that actually work for the key format Google issues now.
    models: ["gemini-3.5-flash", "gemini-pro-latest", "gemini-3.1-flash-lite"],
    modelLabels: { "gemini-3.5-flash": "Gemini 3.5 Flash — FREE · Fast & smart", "gemini-pro-latest": "Gemini Pro — FREE · Slower, deepest", "gemini-3.1-flash-lite": "Gemini 3.1 Lite — FREE · Fastest (~2s)" },
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
  {
    id: "openai", label: "OpenAI", icon: "🟣", badge: "PAID", badgeColor: "rgba(168,85,247,0.12)", badgeBorder: "rgba(168,85,247,0.3)", badgeText: "#c084fc",
    url: "https://platform.openai.com/api-keys", ph: "sk-…",
    models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-4o"],
    modelLabels: { "gpt-5.6-sol": "GPT-5.6 Sol — Flagship", "gpt-5.6-terra": "GPT-5.6 Terra — Balanced", "gpt-5.6-luna": "GPT-5.6 Luna — Fast", "gpt-4o": "GPT-4o — Legacy" },
  },
  {
    id: "anthropic", label: "Anthropic", icon: "🟠", badge: "PAID", badgeColor: "rgba(217,119,6,0.12)", badgeBorder: "rgba(217,119,6,0.3)", badgeText: "#f59e0b",
    url: "https://console.anthropic.com/settings/keys", ph: "sk-ant-…",
    models: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250929"],
    modelLabels: { "claude-sonnet-5": "Claude Sonnet 5 — Balanced", "claude-opus-5": "Claude Opus 5 — Most Capable", "claude-haiku-4-5-20251001": "Claude Haiku 4.5 — Fastest", "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5 — Legacy" },
  },
  {
    id: "grok", label: "Grok (xAI)", icon: "⬛", badge: "PAID", badgeColor: "rgba(255,255,255,0.1)", badgeBorder: "rgba(255,255,255,0.25)", badgeText: "#e5e7eb",
    url: "https://console.x.ai/", ph: "xai-…",
    models: ["grok-4.6", "grok-4.5", "grok-4.3"],
    modelLabels: { "grok-4.6": "Grok 4.6 — Latest", "grok-4.5": "Grok 4.5", "grok-4.3": "Grok 4.3" },
  },
];

export type TestKeyResult = { status: "valid" | "invalid"; message: string };

// Extracted out of ApiSetupPage's handleTestKey so the new Settings-from-
// HomePage panel can run the exact same real API-key tests (endpoints,
// headers, timeouts, CORS-proxy routing) without duplicating — and risking
// drifting from — this logic in a second place.
//
// Every Test press also saves the key (encrypted, server-side) to the user's
// Ghotly AI account — see lib/keySync.ts. That runs in the background AFTER the
// result is computed, so the result is returned exactly as fast as before; the
// optional onSynced callback hears how the save went (saved / skipped / failed).
// Any caller of this function gets the backup for free.
export async function testApiKey(
  providerId: string,
  apiKey: string,
  selectedModel?: string,
  onSynced?: (result: KeySyncResult) => void,
): Promise<TestKeyResult> {
  const result = await runKeyTest(providerId, apiKey, selectedModel);
  void syncApiKey({ provider: providerId, apiKey, status: result.status, message: result.message, model: selectedModel }).then((synced) => {
    try { onSynced?.(synced); } catch { /* a UI callback must never break the backup */ }
  });
  return result;
}

async function runKeyTest(providerId: string, apiKey: string, selectedModel?: string): Promise<TestKeyResult> {
  const key = apiKey.trim();
  if (!key) return { status: "invalid", message: "Enter an API key first" };

  try {
    if (providerId === "deepgram") {
      const silentWav = new Uint8Array([
        0x52,0x49,0x46,0x46, 0x24,0x00,0x00,0x00, 0x57,0x41,0x56,0x45,
        0x66,0x6d,0x74,0x20, 0x10,0x00,0x00,0x00, 0x01,0x00,0x01,0x00,
        0x44,0xac,0x00,0x00, 0x88,0x58,0x01,0x00, 0x02,0x00,0x10,0x00,
        0x64,0x61,0x74,0x61, 0x00,0x00,0x00,0x00
      ]);
      const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-2", {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" },
        body: silentWav,
        signal: AbortSignal.timeout(10000),
      });
      return res.ok
        ? { status: "valid", message: "Deepgram Key Valid! ⚡" }
        : { status: "invalid", message: `Invalid Key (HTTP ${res.status})` };
    }
    if (providerId === "gemini") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel || "gemini-3.5-flash"}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return { status: "valid", message: "Gemini Key Valid! 🔵" };
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error?.message || `Invalid Key (HTTP ${res.status})`;
      return { status: "invalid", message: errMsg.length > 25 ? "Invalid Gemini Key" : errMsg };
    }
    if (providerId === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel || "openai/gpt-oss-120b", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok
        ? { status: "valid", message: "Groq Key Valid! ⚡" }
        : { status: "invalid", message: `Invalid Key (HTTP ${res.status})` };
    }
    if (providerId === "openrouter") {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok && data?.data
        ? { status: "valid", message: "OpenRouter Key Valid! 🔀" }
        : { status: "invalid", message: `Invalid Key (HTTP ${res.status})` };
    }
    if (providerId === "nvidia") {
      // NVIDIA's API blocks direct browser-origin requests (CORS) — goes
      // through the same Electron main-process proxy the real provider uses.
      const result = await window.ghostly.nvidiaTestKey(key);
      return result.ok
        ? { status: "valid", message: "NVIDIA Key Valid! 🟢" }
        : { status: "invalid", message: `Invalid Key (HTTP ${result.status})` };
    }
    if (providerId === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel || "gpt-4o", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok
        ? { status: "valid", message: "OpenAI Key Valid! 🟣" }
        : { status: "invalid", message: `Invalid Key (HTTP ${res.status})` };
    }
    if (providerId === "anthropic") {
      // Anthropic blocks direct browser calls (no CORS) — same main-process proxy.
      const result = await window.ghostly.anthropicApiCall(key, {
        model: selectedModel || "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
      return result.ok
        ? { status: "valid", message: "Anthropic Key Valid! 🟠" }
        : { status: "invalid", message: `Invalid Key (HTTP ${result.status})` };
    }
    if (providerId === "grok") {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel || "grok-4.6", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok
        ? { status: "valid", message: "Grok Key Valid! ⬛" }
        : { status: "invalid", message: `Invalid Key (HTTP ${res.status})` };
    }
    return { status: "invalid", message: "Unknown provider" };
  } catch (err: any) {
    return { status: "invalid", message: err?.message || "Network test failed" };
  }
}

// "☁ Saved to your account" (green) / "☁ Couldn't back up…" (amber) under a Test result. Nothing when
// there is nothing to say (not signed in, still in flight, …) so the Test row is never disturbed.
const SyncNote: React.FC<{ badge?: KeySyncBadge }> = ({ badge }) =>
  badge ? (
    <span
      role="status"
      title={badge.hint}
      className="self-end text-[8px] font-semibold -mt-0.5"
      style={{ color: badge.kind === "saved" ? "#16a34a" : "#b45309" }}
    >
      {badge.kind === "saved" ? "☁ Saved to your account" : "☁ Couldn't back up (will retry on next test)"}
    </span>
  ) : null;

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
  // How the background "save to your account" went for each provider's latest Test, shown next to its
  // result. testSeq numbers the Tests per provider so a late answer to an older Test (or to a key
  // that has since been edited) can't overwrite what the indicator shows now.
  const [syncBadge, setSyncBadge] = useState<Record<string, KeySyncBadge | undefined>>({});
  const testSeq = useRef<Record<string, number>>({});
  const invalidateSync = (providerId: string) => {
    const seq = (testSeq.current[providerId] = (testSeq.current[providerId] || 0) + 1);
    setSyncBadge(prev => (prev[providerId] ? { ...prev, [providerId]: undefined } : prev));
    return seq;
  };

  const hasDeepgram = !!deepgram.trim();
  const filledAI    = AI_PROVIDERS.filter(p => aiKeys[p.id]?.trim());
  const hasAnyAI    = filledAI.length > 0;
  const canProceed  = hasDeepgram && hasAnyAI;

  useEffect(() => {
    if (filledAI.length > 0 && !aiKeys[activeProv]?.trim()) setActiveProv(filledAI[0].id);
  }, [JSON.stringify(aiKeys)]);

  const handleTestKey = async (providerId: string, apiKey: string) => {
    if (!apiKey.trim()) {
      setTestStatus(prev => ({ ...prev, [providerId]: { status: "invalid", message: "Enter an API key first" } }));
      return;
    }
    const seq = invalidateSync(providerId);
    setTestStatus(prev => ({ ...prev, [providerId]: { status: "testing" } }));
    const result = await testApiKey(providerId, apiKey, selModel[providerId], synced => {
      if (testSeq.current[providerId] !== seq) return;
      setSyncBadge(prev => ({ ...prev, [providerId]: toSyncBadge(synced) ?? undefined }));
    });
    setTestStatus(prev => ({ ...prev, [providerId]: result }));
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
      // Choosing a provider here re-activates it if it had been deactivated in Settings.
      disabledProviders: withoutDisabled(settings, activeProv),
    });

    window.ghostly.saveSettings(useStore.getState().settings);
    setAppScreen("audio-setup");
  };

  const INK = "#15162b";
  const SUBTLE = "#6b7280";
  const BORDER = "#e8e8ee";
  const PANEL_BG = "#f7f7fa";

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2 overflow-y-auto"
      style={{ background: "transparent", pointerEvents: "none", userSelect: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[320px] flex flex-col"
        style={{
          pointerEvents: "auto",
          background: "#ffffff",
          borderRadius: "20px",
          border: `1px solid ${BORDER}`,
          boxShadow: "0 20px 50px rgba(20,20,40,0.28), 0 2px 8px rgba(20,20,40,0.08)",
          overflow: "hidden",
        }}
        onMouseEnter={() => window.ghostly.enableMouse()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-3.5 py-2.5" style={{ WebkitAppRegion: "drag", borderBottom: `1px solid ${BORDER}` } as React.CSSProperties}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "15px" }}>🔑</span>
            <div>
              <p className="text-[12px] font-bold leading-none" style={{ color: INK }}>API Setup</p>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-1 rounded-full" style={{ width: i <= 2 ? "16px" : "8px", background: i <= 2 ? INK : "#e0e1e6" }} />
                ))}
                <span className="text-[7.5px] font-bold ml-1" style={{ color: SUBTLE }}>Step 2/3</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setAppScreen("interview-setup")}
            className="flex items-center gap-1 text-[9.5px] font-bold px-2.5 py-1.5 rounded-xl"
            style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, color: SUBTLE, WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
        </div>

        {/* ── Progress checklist ── */}
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                style={{ background: hasDeepgram ? "#16a34a" : PANEL_BG, border: hasDeepgram ? "none" : `1px solid ${BORDER}`, color: hasDeepgram ? "#fff" : SUBTLE }}
              >{hasDeepgram ? "✓" : "1"}</div>
              <span className="text-[9px] font-bold" style={{ color: hasDeepgram ? "#16a34a" : SUBTLE }}>Deepgram</span>
            </div>
            <div className="flex-1 h-px rounded-full" style={{ background: BORDER }}>
              <div className="h-full rounded-full transition-all" style={{ width: hasDeepgram && hasAnyAI ? "100%" : "0%", background: "#16a34a" }} />
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <span className="text-[9px] font-bold" style={{ color: hasAnyAI ? "#16a34a" : SUBTLE }}>AI Provider</span>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                style={{ background: hasAnyAI ? "#16a34a" : PANEL_BG, border: hasAnyAI ? "none" : `1px solid ${BORDER}`, color: hasAnyAI ? "#fff" : SUBTLE }}
              >{hasAnyAI ? "✓" : "2"}</div>
            </div>
          </div>
        </div>

        <div className="mx-4 h-px" style={{ background: BORDER }} />

        {/* Disclosure: pressing Test also saves the key to the user's account (lib/keySync.ts). */}
        <p className="px-4 pt-2 text-[8.5px] font-medium leading-snug" style={{ color: SUBTLE, userSelect: "text" }}>
          🔒 When you press Test, the key is saved (encrypted) to your Ghotly AI account. Email{" "}
          <button type="button" onClick={() => window.ghostly.openExternal("mailto:support@ghotlyai.in")} className="font-bold underline" style={{ color: INK }}>support@ghotlyai.in</button>{" "}
          to have it deleted.
        </p>

        {/* 55vh minus the disclosure line above, so the card keeps its height */}
        <div className="px-3.5 pt-3 pb-2 flex flex-col gap-3 max-h-[calc(55vh-32px)] overflow-y-auto" style={{ scrollbarWidth: "none" }}>

          {/* ── Deepgram ── */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[8px] font-black uppercase tracking-[0.12em] flex items-center gap-1.5" style={{ color: SUBTLE }}>
                🎙️ Deepgram
                <span className="px-1.5 py-0.5 rounded-full text-[7px] font-black" style={{ background: "#fef2f2", color: "#dc2626" }}>REQUIRED</span>
              </label>
              <button onClick={() => window.ghostly.openExternal("https://console.deepgram.com/signup")} className="text-[8.5px] font-bold" style={{ color: INK }}>Get Free Key ↗</button>
            </div>
            <div className="relative">
              <input
                type={showKeys["deepgram"] ? "text" : "password"}
                value={deepgram} onChange={e => { setDeepgram(e.target.value); invalidateSync("deepgram"); }}
                onFocus={() => setDeepFocused(true)}
                onBlur={() => setDeepFocused(false)}
                placeholder="Paste Deepgram API key…"
                className="w-full rounded-xl text-[11px] font-mono focus:outline-none transition-all"
                style={{
                  padding: "9px 36px 9px 12px",
                  background: PANEL_BG,
                  border: hasDeepgram ? "1px solid #86efac" : deepFocused ? `1px solid ${INK}` : `1px solid ${BORDER}`,
                  color: INK,
                }}
              />
              <button
                onClick={() => setShowKeys(s => ({ ...s, deepgram: !s["deepgram"] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] opacity-50 hover:opacity-90"
              >{showKeys["deepgram"] ? "🙈" : "👁"}</button>
            </div>

            <div className="flex items-center justify-between mt-0.5">
              <button
                type="button"
                onClick={() => handleTestKey("deepgram", deepgram)}
                disabled={!hasDeepgram || testStatus["deepgram"]?.status === "testing"}
                className="text-[8.5px] font-extrabold px-2.5 py-1 rounded-lg"
                style={{ background: INK, color: "#fff", opacity: !hasDeepgram ? 0.4 : 1 }}
              >
                {testStatus["deepgram"]?.status === "testing" ? "🔄 Testing..." : "⚡ Test Key"}
              </button>
              {testStatus["deepgram"]?.message && (
                <span className="text-[8px] font-bold" style={{ color: testStatus["deepgram"]?.status === "valid" ? "#16a34a" : "#dc2626" }}>
                  {testStatus["deepgram"]?.message}
                </span>
              )}
            </div>
            <SyncNote badge={syncBadge["deepgram"]} />
          </div>

          <div className="h-px" style={{ background: BORDER }} />

          {/* ── AI Providers ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>🤖 AI Provider</label>
              <span className="text-[8.5px] font-bold" style={{ color: hasAnyAI ? "#16a34a" : SUBTLE }}>{filledAI.length}/{AI_PROVIDERS.length} added</span>
            </div>

            <div className="flex flex-col gap-2">
              {AI_PROVIDERS.map(p => {
                const hasKey   = !!aiKeys[p.id]?.trim();
                const isActive = activeProv === p.id;
                const isOpen   = expanded === p.id;

                return (
                  <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: isActive && hasKey ? "#f0f0fb" : PANEL_BG, border: `1px solid ${isActive && hasKey ? "#c7c9f0" : BORDER}` }}>
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <span className="text-[14px] shrink-0">{p.icon}</span>
                      <span className="text-[11px] font-bold flex-1" style={{ color: INK }}>{p.label}</span>
                      <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, color: SUBTLE }}>{p.badge}</span>
                      {hasKey && <span className="text-[9px] font-black shrink-0" style={{ color: "#16a34a" }}>✓</span>}
                      {hasKey && (
                        <button
                          onClick={() => setActiveProv(p.id)}
                          className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase shrink-0"
                          style={{ background: isActive ? INK : "#fff", border: `1px solid ${isActive ? INK : BORDER}`, color: isActive ? "#fff" : SUBTLE }}
                        >{isActive ? "Active" : "Use"}</button>
                      )}
                      <button onClick={() => window.ghostly.openExternal(p.url)} className="text-[10px] shrink-0 opacity-50" style={{ color: INK }}>↗</button>
                      <button onClick={() => setExpanded(isOpen ? null : p.id)} className="text-[9px] shrink-0" style={{ color: SUBTLE, transform: isOpen ? "rotate(180deg)" : "none" }}>▼</button>
                    </div>

                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        className="px-3 pb-3 flex flex-col gap-2"
                        style={{ borderTop: `1px solid ${BORDER}` }}
                      >
                        <div className="relative mt-2.5">
                          <input
                            type={showKeys[p.id] ? "text" : "password"}
                            value={aiKeys[p.id] || ""}
                            onChange={e => { setAiKeys(k => ({ ...k, [p.id]: e.target.value })); invalidateSync(p.id); }}
                            placeholder={p.ph}
                            className="w-full rounded-lg text-[10px] font-mono focus:outline-none transition-all"
                            style={{ padding: "8px 32px 8px 10px", background: "#fff", border: hasKey ? "1px solid #86efac" : `1px solid ${BORDER}`, color: INK }}
                          />
                          <button
                            onClick={() => setShowKeys(s => ({ ...s, [p.id]: !s[p.id] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] opacity-50 hover:opacity-90"
                          >{showKeys[p.id] ? "🙈" : "👁"}</button>
                        </div>

                        {hasKey && (
                          <select
                            value={selModel[p.id] || p.models[0]}
                            onChange={e => setSelModel(m => ({ ...m, [p.id]: e.target.value }))}
                            className="w-full text-[9.5px] font-semibold rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
                            style={{ background: "#fff", border: `1px solid ${BORDER}`, color: INK }}
                          >
                            {p.models.map(m => <option key={m} value={m}>{p.modelLabels[m] || m}</option>)}
                          </select>
                        )}

                        <div className="flex items-center justify-between mt-1 pt-1" style={{ borderTop: `1px solid ${BORDER}` }}>
                          <button
                            type="button"
                            onClick={() => handleTestKey(p.id, aiKeys[p.id] || "")}
                            disabled={!hasKey || testStatus[p.id]?.status === "testing"}
                            className="text-[8.5px] font-extrabold px-2.5 py-1 rounded-lg"
                            style={{ background: INK, color: "#fff", opacity: !hasKey ? 0.4 : 1 }}
                          >
                            {testStatus[p.id]?.status === "testing" ? "🔄 Testing..." : "⚡ Test Key"}
                          </button>
                          {testStatus[p.id]?.message && (
                            <span className="text-[8px] font-bold truncate max-w-[170px]" style={{ color: testStatus[p.id]?.status === "valid" ? "#16a34a" : "#dc2626" }}>
                              {testStatus[p.id]?.message}
                            </span>
                          )}
                        </div>
                        <SyncNote badge={syncBadge[p.id]} />
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-3.5 pb-3.5 pt-2.5" style={{ borderTop: `1px solid ${BORDER}` }}>
          <motion.button
            whileHover={canProceed ? { scale: 1.015 } : {}}
            whileTap={canProceed ? { scale: 0.98 } : {}}
            onClick={handleSave} disabled={!canProceed}
            className="w-full py-3 rounded-full text-[12.5px] font-bold flex items-center justify-center gap-2"
            style={{ background: canProceed ? INK : PANEL_BG, color: canProceed ? "#fff" : SUBTLE, border: canProceed ? "none" : `1px solid ${BORDER}`, cursor: canProceed ? "pointer" : "not-allowed" }}
          >
            <span className="text-[13px]">{canProceed ? "🎙️" : "🔒"}</span>
            <span>{canProceed ? "Save & Continue →" : "Complete required fields"}</span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};
