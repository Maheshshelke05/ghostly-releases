import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";
import type { CandidateProfile } from "../store/useStore";

// Same light palette as LoginPage.tsx/HomePage.tsx — this wizard step was
// restyled to match, keeping every existing field/behavior (company,
// position, spoken-interview language, Auto AI toggle, custom instructions,
// candidate profile tab) unchanged.
const INK = "#15162b";
const SUBTLE = "#6b7280";
const BORDER = "#e8e8ee";
const PANEL_BG = "#f7f7fa";

const LANGUAGES = [
  { id: "english", flag: "🇺🇸", name: "English" },
  { id: "hindi",   flag: "🇮🇳", name: "Hindi"   },
  { id: "marathi", flag: "🇮🇳", name: "Marathi" },
  { id: "spanish", flag: "🇪🇸", name: "Spanish" },
  { id: "french",  flag: "🇫🇷", name: "French"  },
  { id: "german",  flag: "🇩🇪", name: "German"  },
  { id: "japanese",flag: "🇯🇵", name: "Japanese"},
  { id: "chinese", flag: "🇨🇳", name: "Chinese" },
];

const EMPTY_PROFILE: CandidateProfile = {
  fullName: "", email: "", phone: "", location: "",
  summary: "", skills: "", experience: "", projects: "",
  education: "", certifications: "", linkedin: "", github: "",
};

const LightInput: React.FC<{
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; label?: string; emoji?: string;
}> = ({ value, onChange, placeholder, type = "text", label, emoji }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>{emoji} {label}</label>
      )}
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="w-full rounded-xl text-[11px] font-medium outline-none transition-all"
        style={{
          background: PANEL_BG,
          border: focused ? `1px solid ${INK}` : `1px solid ${BORDER}`,
          color: INK, padding: "8px 10px", fontFamily: "'Inter', sans-serif",
        }}
      />
    </div>
  );
};

const LightTextarea: React.FC<{
  value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number; label?: string; emoji?: string;
}> = ({ value, onChange, placeholder, rows = 2, label, emoji }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>{emoji} {label}</label>
      )}
      <textarea
        value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder} rows={rows}
        className="w-full rounded-xl text-[11px] font-medium outline-none resize-none leading-relaxed transition-all"
        style={{
          background: PANEL_BG,
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
  const [language, setLanguage]       = useState("english");
  const [autoAI, setAutoAI]           = useState(settings.autoAI ?? true);
  const [customInstructions, setCustomInstructions] = useState(settings.customInstructions ?? "");
  const [langOpen, setLangOpen]       = useState(false);
  const [profile, setProfile]         = useState<CandidateProfile>(savedProfile ?? EMPTY_PROFILE);
  const [activeTab, setActiveTab]     = useState<"session" | "profile">("session");

  React.useEffect(() => {
    window.ghostly.getSavedProfile().then(saved => {
      if (saved) { setProfile(saved); setSavedProfile(saved); }
    }).catch(() => {});
  }, [setSavedProfile]);

  const isReady    = !!(companyName.trim() && position.trim());
  const hasProfile = !!(profile.fullName || profile.skills || profile.experience);
  const selLang = LANGUAGES.find(l => l.id === language) || LANGUAGES[0];

  const handleContinue = async () => {
    if (!isReady) return;
    updateSettings({ autoAI, customInstructions });
    if (hasProfile) { setSavedProfile(profile); await window.ghostly.saveProfile(profile).catch(() => {}); }
    setInterviewSession({
      companyName: companyName.trim(), position: position.trim(),
      language, description: customInstructions.trim(),
      profile: hasProfile ? profile : null,
    });
    setTimeout(() => window.ghostly.saveSettings(useStore.getState().settings), 50);
    setAppScreen("audio-setup");
  };

  const TABS = [
    { id: "session" as const, icon: "🎯", label: "Session" },
    { id: "profile" as const, icon: "👤", label: `Profile${hasProfile ? " ✓" : ""}` },
  ];

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
                <LightInput value={companyName} onChange={setCompanyName} placeholder="Google, TCS…" label="Company *" emoji="🏢" />
                <LightInput value={position} onChange={setPosition} placeholder="SWE, PM…" label="Position *" emoji="💼" />
              </div>

              {/* Language dropdown */}
              <div className="flex flex-col gap-1 relative z-50">
                <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>🌐 Interview Language</label>
                <button
                  onClick={() => setLangOpen(!langOpen)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background: PANEL_BG, border: langOpen ? `1px solid ${INK}` : `1px solid ${BORDER}`, color: INK }}
                >
                  <span className="flex items-center gap-2 text-[11px] font-semibold"><span>{selLang.flag}</span>{selLang.name}</span>
                  <span className={`text-[8px] transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`} style={{ color: SUBTLE }}>▼</span>
                </button>
                <AnimatePresence>
                  {langOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.12 }}
                      className="absolute top-[calc(100%+4px)] left-0 right-0 rounded-[16px] z-50 p-2"
                      style={{ background: "#ffffff", border: `1px solid ${BORDER}`, boxShadow: "0 16px 40px rgba(20,20,40,0.25)" }}
                    >
                      <div className="grid grid-cols-2 gap-1">
                        {LANGUAGES.map(l => (
                          <button
                            key={l.id}
                            onClick={() => { setLanguage(l.id); setLangOpen(false); }}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-[10px] font-semibold text-left"
                            style={{ background: language === l.id ? PANEL_BG : "transparent", color: language === l.id ? INK : SUBTLE }}
                          >
                            {l.flag} {l.name}
                            {language === l.id && <span className="ml-auto text-[9px]">✓</span>}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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

              <LightTextarea value={customInstructions} onChange={setCustomInstructions} placeholder="e.g. Speak concisely, focus on system design…" rows={2} label="Custom Instructions" emoji="✏️" />
            </motion.div>
          ) : (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              className="px-3.5 pt-3 pb-3 flex flex-col gap-2.5 max-h-[52vh] overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: hasProfile ? "#f0fdf4" : PANEL_BG, border: `1px solid ${hasProfile ? "#bbf7d0" : BORDER}` }}>
                <span className="text-[13px]">{hasProfile ? "✓" : "💡"}</span>
                <p className="text-[9px] font-semibold" style={{ color: hasProfile ? "#16a34a" : SUBTLE }}>
                  {hasProfile ? "Profile saved — AI will speak as you" : "AI will speak as you using your profile info."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "fullName", label: "Name",     emoji: "👤", ph: "Rahul Sharma"   },
                  { key: "location", label: "Location", emoji: "📍", ph: "Pune, India"    },
                  { key: "email",    label: "Email",    emoji: "📧", ph: "you@email.com"  },
                  { key: "phone",    label: "Phone",    emoji: "📱", ph: "+91 98765…"     },
                ].map(({ key, label, emoji, ph }) => (
                  <LightInput key={key} value={profile[key as keyof CandidateProfile]} onChange={v => setProfile(p => ({ ...p, [key]: v }))} placeholder={ph} label={label} emoji={emoji} />
                ))}
              </div>

              {[
                { key: "summary",        label: "Summary",       emoji: "📝", ph: "3+ years full-stack developer…",    rows: 2 },
                { key: "skills",         label: "Skills",         emoji: "⚡", ph: "React, Node.js, Python, AWS…",      rows: 2 },
                { key: "experience",     label: "Experience",     emoji: "💼", ph: "SWE @ Infosys (2022–Now)…",        rows: 3 },
                { key: "projects",       label: "Projects",       emoji: "🚀", ph: "E-Commerce (React+Node)…",         rows: 3 },
                { key: "education",      label: "Education",      emoji: "🎓", ph: "B.E. CS — SPPU, Pune (2022)",       rows: 1 },
                { key: "certifications", label: "Certifications", emoji: "🏆", ph: "AWS Developer, GCP…",              rows: 1 },
              ].map(({ key, label, emoji, ph, rows }) => (
                <LightTextarea key={key} value={profile[key as keyof CandidateProfile]} onChange={v => setProfile(p => ({ ...p, [key]: v }))} placeholder={ph} rows={rows} label={label} emoji={emoji} />
              ))}

              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "github",   label: "GitHub",   emoji: "🐙", ph: "github.com/you" },
                  { key: "linkedin", label: "LinkedIn",  emoji: "💼", ph: "linkedin.com/in/you" },
                ].map(({ key, label, emoji, ph }) => (
                  <LightInput key={key} value={profile[key as keyof CandidateProfile]} onChange={v => setProfile(p => ({ ...p, [key]: v }))} placeholder={ph} label={label} emoji={emoji} />
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
