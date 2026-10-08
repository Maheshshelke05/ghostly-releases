import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { useStore } from "../store/useStore";
import type { CandidateProfile } from "../store/useStore";
import { usableApiKeys } from "../lib/providerState";
import { ResumeCard } from "../lib/resume/ResumeCard";
import { mergeImportedProfile, removeAutoFilled } from "../lib/resume/parse";
import { EMPTY_PROFILE, PROFILE_KEYS } from "../lib/resume/types";
import type { ProfileKey } from "../lib/resume/types";
import { useResumeImport } from "../lib/resume/useResumeImport";

// Same light palette as LoginPage.tsx/HomePage.tsx — this wizard step was
// restyled to match, keeping every existing field/behavior (company,
// position, Auto AI toggle, custom instructions, candidate profile tab).
// Interview language is English only (the transcription and answer prompts are
// English-only), so it is shown as a fixed pill instead of a picker.
// The Profile tab can be filled by uploading a resume (see lib/resume/).
const INK = "#15162b";
const SUBTLE = "#6b7280";
const BORDER = "#e8e8ee";
const PANEL_BG = "#f7f7fa";

const LANGUAGE = "english";

// Short highlight on fields a resume just filled in.
const FLASH_BG = "#dcfce7";
const FLASH_RING = "rgba(34,197,94,0.55)";

function useFlash(flash: number) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (!flash) return;
    void controls.start({
      backgroundColor: [FLASH_BG, PANEL_BG],
      boxShadow: [`0 0 0 2px ${FLASH_RING}`, "0 0 0 0px rgba(34,197,94,0)"],
      transition: { duration: 1.8, ease: "easeOut" },
    });
  }, [flash, controls]);
  return controls;
}

const LightInput: React.FC<{
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; label?: string; emoji?: string; id?: string; flash?: number;
}> = ({ value, onChange, placeholder, type = "text", label, emoji, id, flash = 0 }) => {
  const [focused, setFocused] = useState(false);
  const controls = useFlash(flash);
  return (
    <div className="flex flex-col gap-1 min-w-0">
      {label && (
        <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>{emoji} {label}</label>
      )}
      <motion.input
        data-testid={id ? `field-${id}` : undefined} animate={controls}
        type={type} value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="w-full rounded-xl text-[11px] font-medium outline-none transition-colors"
        style={{
          backgroundColor: PANEL_BG,
          border: focused ? `1px solid ${INK}` : `1px solid ${BORDER}`,
          color: INK, padding: "8px 10px", fontFamily: "'Inter', sans-serif",
        }}
      />
    </div>
  );
};

// Grows with its content (so text a resume filled in can be read without scrolling inside a tiny box),
// up to maxRows, then scrolls.
const LightTextarea: React.FC<{
  value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number; maxRows?: number; label?: string; emoji?: string; id?: string; flash?: number;
}> = ({ value, onChange, placeholder, rows = 2, maxRows = 7, label, emoji, id, flash = 0 }) => {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const controls = useFlash(flash);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const min = rows * 18 + 18;
    const max = maxRows * 18 + 18;
    el.style.height = `${Math.max(min, Math.min(el.scrollHeight + 2, max))}px`;
  }, [value, rows, maxRows]);
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>{emoji} {label}</label>
      )}
      <motion.textarea
        ref={ref} data-testid={id ? `field-${id}` : undefined} animate={controls}
        value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder} rows={rows}
        className="w-full rounded-xl text-[11px] font-medium outline-none resize-none leading-relaxed transition-colors"
        style={{
          backgroundColor: PANEL_BG,
          border: focused ? `1px solid ${INK}` : `1px solid ${BORDER}`,
          color: INK, padding: "8px 10px", fontFamily: "'Inter', sans-serif",
        }}
      />
    </div>
  );
};

export const InterviewSetupPage: React.FC = () => {
  const { setAppScreen, setInterviewSession, settings, updateSettings, savedProfile, setSavedProfile } = useStore();
  const [companyName, setCompanyName] = useState("");
  const [position, setPosition]       = useState("");
  const [autoAI, setAutoAI]           = useState(settings.autoAI ?? true);
  const [customInstructions, setCustomInstructions] = useState(settings.customInstructions ?? "");
  const [profile, setProfile]         = useState<CandidateProfile>(savedProfile ?? EMPTY_PROFILE);
  const [activeTab, setActiveTab]     = useState<"session" | "profile">("session");

  // ── resume import bookkeeping ──
  const profileRef = useRef(profile);
  profileRef.current = profile;
  // fields currently holding resume-derived values the user has not edited since
  const [autoKeys, setAutoKeys] = useState<ReadonlySet<ProfileKey>>(() => new Set());
  const autoKeysRef = useRef(autoKeys);
  autoKeysRef.current = autoKeys;
  // snapshots from before each import / removal, for Undo
  const [undoStack, setUndoStack] = useState<CandidateProfile[]>([]);
  const [flash, setFlash] = useState<{ token: number; keys: ReadonlySet<ProfileKey> }>({ token: 0, keys: new Set() });
  const [notice, setNotice] = useState<{ text: string; undo?: boolean } | null>(null);

  React.useEffect(() => {
    window.ghostly.getSavedProfile().then(saved => {
      if (saved) { setProfile(saved); setSavedProfile(saved); }
    }).catch(() => {});
  }, [setSavedProfile]);

  // Dropping a file anywhere on the window would otherwise make Electron navigate to it.
  useEffect(() => {
    const stop = (e: DragEvent) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, []);

  const persist = useCallback((p: CandidateProfile) => {
    setSavedProfile(p);
    window.ghostly.saveProfile(p).catch(() => {});
  }, [setSavedProfile]);

  const setField = useCallback((key: ProfileKey, value: string) => {
    setProfile(p => ({ ...p, [key]: value }));
    setAutoKeys(s => (s.has(key) ? new Set([...s].filter(k => k !== key)) : s));
    setNotice(null);
  }, []);

  const handleImported = useCallback((imported: CandidateProfile) => {
    const before = profileRef.current;
    const { next, changed, filled } = mergeImportedProfile(before, imported, autoKeysRef.current);
    setUndoStack(s => [...s, before].slice(-6));
    profileRef.current = next;
    setProfile(next);
    persist(next); // saved the moment it is filled, not only on Continue
    setAutoKeys(new Set(filled));
    setFlash({ token: Date.now(), keys: new Set(changed.length ? changed : filled) });
    setNotice(null);
  }, [persist]);

  const resume = useResumeImport(handleImported);

  const handleUndo = () => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    const cur = profileRef.current;
    setUndoStack(s => s.slice(0, -1));
    profileRef.current = prev;
    setProfile(prev);
    persist(prev);
    setAutoKeys(new Set());
    setFlash({ token: Date.now(), keys: new Set(PROFILE_KEYS.filter(k => prev[k] !== cur[k])) });
    resume.reset();
    setNotice({ text: "Restored the details you had before." });
  };

  const handleRemove = () => {
    const cur = profileRef.current;
    const next = removeAutoFilled(cur, autoKeysRef.current);
    setUndoStack(s => [...s, cur].slice(-6));
    profileRef.current = next;
    setProfile(next);
    persist(next);
    setAutoKeys(new Set());
    resume.reset();
    setNotice({ text: "Resume details removed.", undo: true });
  };

  const hasKey     = Object.keys(usableApiKeys(settings)).length > 0;
  const importing  = resume.state.status === "working";
  const isReady    = !!(companyName.trim() && position.trim());
  const hasProfile = !!(profile.fullName || profile.skills || profile.experience || profile.summary || profile.projects || profile.education);

  const handleContinue = async () => {
    if (!isReady) return;
    updateSettings({ autoAI, customInstructions });
    if (hasProfile) { setSavedProfile(profile); await window.ghostly.saveProfile(profile).catch(() => {}); }
    setInterviewSession({
      companyName: companyName.trim(), position: position.trim(),
      language: LANGUAGE, description: customInstructions.trim(),
      profile: hasProfile ? profile : null,
    });
    setTimeout(() => window.ghostly.saveSettings(useStore.getState().settings), 50);
    setAppScreen("audio-setup");
  };

  const TABS = [
    { id: "session" as const, icon: "🎯", label: "Session" },
    { id: "profile" as const, icon: "👤", label: `Profile${hasProfile ? " ✓" : ""}` },
  ];

  const fl = (key: ProfileKey) => (flash.keys.has(key) ? flash.token : 0);

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
            <span style={{ fontSize: "15px" }}>🎯</span>
            <div>
              <p className="text-[12px] font-bold leading-none" style={{ color: INK }}>Interview Setup</p>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2].map(i => (
                  <div key={i} className="h-1 rounded-full" style={{ width: i === 1 ? "16px" : "8px", background: i === 1 ? INK : "#e0e1e6" }} />
                ))}
                <span className="text-[7.5px] font-bold ml-1" style={{ color: SUBTLE }}>Step 1/2</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setAppScreen("home")}
            className="flex items-center gap-1 text-[9.5px] font-bold px-2.5 py-1.5 rounded-xl"
            style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, color: SUBTLE, WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            Back
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1.5 px-3.5 pt-3">
          {TABS.map(tab => (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 py-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5"
              style={{
                background: activeTab === tab.id ? INK : PANEL_BG,
                color: activeTab === tab.id ? "#fff" : SUBTLE,
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "session" ? (
            <motion.div
              key="session"
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="px-3.5 pt-3 pb-3 flex flex-col gap-3 max-h-[52vh] overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
            >
              <div className="grid grid-cols-2 gap-2">
                <LightInput id="company" value={companyName} onChange={setCompanyName} placeholder="Google, TCS…" label="Company *" emoji="🏢" />
                <LightInput id="position" value={position} onChange={setPosition} placeholder="SWE, PM…" label="Position *" emoji="💼" />
              </div>

              {/* Interview language — English only (static, not a control) */}
              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>🌐 Interview Language</label>
                <div
                  data-testid="lang-pill" role="note" aria-label="Interview language: English"
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, color: INK, cursor: "default" }}
                >
                  <span className="flex items-center gap-2 text-[11px] font-semibold"><span>🇺🇸</span>English</span>
                  <span className="text-[10px] font-black" style={{ color: "#16a34a" }}>✓</span>
                </div>
              </div>

              {/* Auto AI toggle */}
              <div className="flex items-center justify-between px-3 py-3 rounded-xl" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
                <div>
                  <p className="text-[11px] font-bold" style={{ color: INK }}>Auto AI Answer</p>
                  <p className="text-[8.5px] font-medium mt-0.5" style={{ color: SUBTLE }}>Responds after silence detected</p>
                </div>
                <button
                  onClick={() => setAutoAI(!autoAI)}
                  style={{ width: "36px", height: "20px", background: autoAI ? INK : "#e0e1e6", borderRadius: "999px", border: "none", cursor: "pointer", position: "relative", transition: "all 0.2s" }}
                >
                  <motion.div
                    animate={{ x: autoAI ? 17 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    style={{ position: "absolute", top: "3px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}
                  />
                </button>
              </div>

              <LightTextarea id="instructions" value={customInstructions} onChange={setCustomInstructions} placeholder="e.g. Speak concisely, focus on system design…" rows={2} label="Custom Instructions" emoji="✏️" />
            </motion.div>
          ) : (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              className="px-3.5 pt-3 pb-3 flex flex-col gap-2.5 max-h-[52vh] overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
            >
              <ResumeCard
                state={resume.state}
                hasKey={hasKey}
                canUndo={undoStack.length > 0}
                canRemove={autoKeys.size > 0}
                notice={notice}
                onFile={resume.start}
                onCancel={resume.cancel}
                onRetry={resume.retry}
                onDismissError={resume.reset}
                onUndo={handleUndo}
                onRemove={handleRemove}
              />

              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: hasProfile ? "#f0fdf4" : PANEL_BG, border: `1px solid ${hasProfile ? "#bbf7d0" : BORDER}` }}>
                <span className="text-[13px]">{hasProfile ? "✓" : "💡"}</span>
                <p className="text-[9px] font-semibold" style={{ color: hasProfile ? "#16a34a" : SUBTLE }}>
                  {hasProfile ? "Profile saved — AI will speak as you" : "…or fill it in by hand. AI speaks as you using this info."}
                </p>
              </div>

              {/* the manual fields stay editable at all times except while a resume is being filled in */}
              <div
                className="flex flex-col gap-2.5 transition-opacity" aria-busy={importing}
                style={{ opacity: importing ? 0.5 : 1, pointerEvents: importing ? "none" : "auto" }}
              >
                {/* Name + phone are short; email and location are not, so they get a full row each — a value a
                    resume just filled in must be readable without clicking into the field. */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: "fullName", label: "Name",     emoji: "👤", ph: "Rahul Sharma"   },
                    { key: "phone",    label: "Phone",    emoji: "📱", ph: "+91 98765…"     },
                  ] as const).map(({ key, label, emoji, ph }) => (
                    <LightInput key={key} id={key} value={profile[key]} onChange={v => setField(key, v)} placeholder={ph} label={label} emoji={emoji} flash={fl(key)} />
                  ))}
                </div>
                {([
                  { key: "email",    label: "Email",    emoji: "📧", ph: "you@email.com"  },
                  { key: "location", label: "Location", emoji: "📍", ph: "Pune, India"    },
                ] as const).map(({ key, label, emoji, ph }) => (
                  <LightInput key={key} id={key} value={profile[key]} onChange={v => setField(key, v)} placeholder={ph} label={label} emoji={emoji} flash={fl(key)} />
                ))}

                {([
                  { key: "summary",        label: "Summary",       emoji: "📝", ph: "3+ years full-stack developer…",    rows: 2, max: 8  },
                  { key: "skills",         label: "Skills",         emoji: "⚡", ph: "React, Node.js, Python, AWS…",      rows: 2, max: 8  },
                  { key: "experience",     label: "Experience",     emoji: "💼", ph: "SWE @ Infosys (2022–Now)…",        rows: 3, max: 22 },
                  { key: "projects",       label: "Projects",       emoji: "🚀", ph: "E-Commerce (React+Node)…",         rows: 3, max: 22 },
                  { key: "education",      label: "Education",      emoji: "🎓", ph: "B.E. CS — SPPU, Pune (2022)",       rows: 1, max: 8  },
                  { key: "certifications", label: "Certifications", emoji: "🏆", ph: "AWS Developer, GCP…",              rows: 1, max: 6  },
                ] as const).map(({ key, label, emoji, ph, rows, max }) => (
                  <LightTextarea key={key} id={key} value={profile[key]} onChange={v => setField(key, v)} placeholder={ph} rows={rows} maxRows={max} label={label} emoji={emoji} flash={fl(key)} />
                ))}

                {([
                  { key: "github",   label: "GitHub",   emoji: "🐙", ph: "github.com/you" },
                  { key: "linkedin", label: "LinkedIn",  emoji: "💼", ph: "linkedin.com/in/you" },
                ] as const).map(({ key, label, emoji, ph }) => (
                  <LightInput key={key} id={key} value={profile[key]} onChange={v => setField(key, v)} placeholder={ph} label={label} emoji={emoji} flash={fl(key)} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer ── */}
        <div className="px-3.5 pb-3.5 pt-2.5" style={{ borderTop: `1px solid ${BORDER}` }}>
          {!isReady && activeTab === "profile" && (
            <p className="text-[8.5px] font-semibold text-center mb-2 flex items-center justify-center gap-1.5" style={{ color: "#d97706" }}>
              <span>⚠</span> Fill Company & Position in Session tab first
            </p>
          )}
          <motion.button
            data-testid="continue"
            whileHover={isReady ? { scale: 1.015 } : {}}
            whileTap={isReady ? { scale: 0.98 } : {}}
            onClick={handleContinue} disabled={!isReady}
            className="w-full py-3 rounded-full text-[12.5px] font-bold flex items-center justify-center gap-2"
            style={{
              background: isReady ? INK : PANEL_BG,
              color: isReady ? "#fff" : SUBTLE,
              border: isReady ? "none" : `1px solid ${BORDER}`,
              cursor: isReady ? "pointer" : "not-allowed",
            }}
          >
            <span className="text-[13px]">{isReady ? "🎙️" : "🔒"}</span>
            <span>{isReady ? "Continue to Audio Setup →" : "Fill Company & Position first"}</span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};
