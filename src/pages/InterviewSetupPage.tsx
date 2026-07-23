import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";
import type { CandidateProfile } from "../store/useStore";

/* ── Design tokens ── */
const GLASS: React.CSSProperties = {
  background: "rgba(13,13,20,0.9)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
};
const GLASS_INSET: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "12px",
};

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

/* ── Styled input helper ── */
const GlassInput: React.FC<{
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; label?: string; emoji?: string;
}> = ({ value, onChange, placeholder, type = "text", label, emoji }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.28)" }}>
          {emoji} {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="w-full rounded-xl text-[11px] font-medium outline-none transition-all placeholder:text-white/15"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: focused ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
          boxShadow: focused ? "0 0 0 3px rgba(139,92,246,0.1)" : "none",
          color: "rgba(255,255,255,0.82)",
          padding: "8px 10px",
          fontFamily: "'Inter', sans-serif",
        }}
      />
    </div>
  );
};

const GlassTextarea: React.FC<{
  value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number; label?: string; emoji?: string;
}> = ({ value, onChange, placeholder, rows = 2, label, emoji }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.28)" }}>
          {emoji} {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl text-[11px] font-medium outline-none resize-none leading-relaxed transition-all placeholder:text-white/15"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: focused ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
          boxShadow: focused ? "0 0 0 3px rgba(139,92,246,0.1)" : "none",
          color: "rgba(255,255,255,0.82)",
          padding: "8px 10px",
          fontFamily: "'Inter', sans-serif",
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
  const setField   = (key: keyof CandidateProfile) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProfile(p => ({ ...p, [key]: e.target.value }));
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
    setAppScreen("api-setup");
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
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(139,92,246,0.09) 0%, transparent 60%)" }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[315px] flex flex-col gap-2.5 relative z-10"
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
            >🎯</div>
            <div>
              <p className="text-[13px] font-black text-white leading-tight">Interview Setup</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="h-1 rounded-full transition-all"
                    style={{
                      width: i === 1 ? "20px" : "10px",
                      background: i === 1 ? "rgba(139,92,246,0.8)" : "rgba(255,255,255,0.12)",
                    }}
                  />
                ))}
                <span className="text-[8px] font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>Step 1/3</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setAppScreen("home")}
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
        <div className="w-full rounded-[22px] overflow-hidden" style={GLASS}>
          {/* Violet accent top */}
          <div className="h-0.5" style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.7), rgba(99,102,241,0.5), transparent)" }} />

          {/* ── Tabs ── */}
          <div className="flex gap-1.5 px-3 pt-3">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 py-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background: activeTab === tab.id ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
                  border: activeTab === tab.id ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(255,255,255,0.07)",
                  color: activeTab === tab.id ? "#a78bfa" : "rgba(255,255,255,0.35)",
                  boxShadow: activeTab === tab.id ? "0 0 12px rgba(139,92,246,0.15)" : "none",
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
                className="px-3 pt-3 pb-3 flex flex-col gap-3 max-h-[52vh] overflow-y-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {/* Company + Position */}
                <div className="grid grid-cols-2 gap-2">
                  <GlassInput value={companyName} onChange={setCompanyName} placeholder="Google, TCS…" label="Company *" emoji="🏢" />
                  <GlassInput value={position} onChange={setPosition} placeholder="SWE, PM…" label="Position *" emoji="💼" />
                </div>

                {/* Language dropdown */}
                <div className="flex flex-col gap-1 relative z-50">
                  <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.28)" }}>
                    🌐 Language
                  </label>
                  <button
                    onClick={() => setLangOpen(!langOpen)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: langOpen ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                      boxShadow: langOpen ? "0 0 0 3px rgba(139,92,246,0.1)" : "none",
                      color: "rgba(255,255,255,0.8)",
                    }}
                  >
                    <span className="flex items-center gap-2 text-[11px] font-semibold">
                      <span>{selLang.flag}</span>{selLang.name}
                    </span>
                    <span className={`text-[8px] transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`} style={{ color: "rgba(255,255,255,0.3)" }}>▼</span>
                  </button>
                  <AnimatePresence>
                    {langOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.12 }}
                        className="absolute top-[calc(100%+4px)] left-0 right-0 rounded-[16px] z-50 p-2"
                        style={{
                          background: "rgba(13,13,20,0.98)",
                          backdropFilter: "blur(24px)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          boxShadow: "0 16px 40px rgba(0,0,0,0.7)",
                        }}
                      >
                        <div className="grid grid-cols-2 gap-1">
                          {LANGUAGES.map(l => (
                            <button
                              key={l.id}
                              onClick={() => { setLanguage(l.id); setLangOpen(false); }}
                              className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-[10px] font-semibold text-left transition-all"
                              style={{
                                background: language === l.id ? "rgba(139,92,246,0.15)" : "transparent",
                                border: language === l.id ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
                                color: language === l.id ? "#a78bfa" : "rgba(255,255,255,0.55)",
                              }}
                              onMouseEnter={e => { if (language !== l.id) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                              onMouseLeave={e => { if (language !== l.id) e.currentTarget.style.background = "transparent"; }}
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
                <div
                  className="flex items-center justify-between px-3 py-3 rounded-xl"
                  style={{
                    background: autoAI ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.04)",
                    border: autoAI ? "1px solid rgba(139,92,246,0.25)" : "1px solid rgba(255,255,255,0.07)",
                    transition: "all 0.2s",
                  }}
                >
                  <div>
                    <p className="text-[11px] font-bold" style={{ color: autoAI ? "#a78bfa" : "rgba(255,255,255,0.6)" }}>
                      Auto AI Answer
                    </p>
                    <p className="text-[8.5px] font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Responds after silence detected
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoAI(!autoAI)}
                    style={{
                      width: "36px", height: "20px",
                      background: autoAI ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.08)",
                      boxShadow: autoAI ? "0 0 12px rgba(139,92,246,0.4)" : "none",
                      borderRadius: "999px", border: "none", cursor: "pointer", position: "relative", transition: "all 0.2s",
                    }}
                  >
                    <motion.div
                      animate={{ x: autoAI ? 17 : 2 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      style={{
                        position: "absolute", top: "3px",
                        width: "14px", height: "14px",
                        borderRadius: "50%", background: "#fff",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                      }}
                    />
                  </button>
                </div>

                {/* Custom Instructions */}
                <GlassTextarea
                  value={customInstructions}
                  onChange={setCustomInstructions}
                  placeholder="Always write code in Python…"
                  rows={2}
                  label="Custom Instructions"
                  emoji="✏️"
                />
              </motion.div>
            ) : (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.15 }}
                className="px-3 pt-3 pb-3 flex flex-col gap-2.5 max-h-[52vh] overflow-y-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {/* Banner */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{
                    background: hasProfile ? "rgba(139,92,246,0.1)" : "rgba(255,255,255,0.04)",
                    border: hasProfile ? "1px solid rgba(139,92,246,0.25)" : "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <span className="text-[13px]">{hasProfile ? "✓" : "💡"}</span>
                  <p className="text-[9px] font-semibold" style={{ color: hasProfile ? "#a78bfa" : "rgba(255,255,255,0.38)" }}>
                    {hasProfile ? "Profile saved — AI will speak as you" : "AI will speak as you using your profile info."}
                  </p>
                </div>

                {/* Name / Location / Email / Phone */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "fullName", label: "Name",     emoji: "👤", ph: "Rahul Sharma"   },
                    { key: "location", label: "Location", emoji: "📍", ph: "Pune, India"    },
                    { key: "email",    label: "Email",    emoji: "📧", ph: "you@email.com"  },
                    { key: "phone",    label: "Phone",    emoji: "📱", ph: "+91 98765…"     },
                  ].map(({ key, label, emoji, ph }) => (
                    <GlassInput
                      key={key}
                      value={profile[key as keyof CandidateProfile]}
                      onChange={v => setProfile(p => ({ ...p, [key]: v }))}
                      placeholder={ph}
                      label={label}
                      emoji={emoji}
                    />
                  ))}
                </div>

                {/* Textareas */}
                {[
                  { key: "summary",        label: "Summary",       emoji: "📝", ph: "3+ years full-stack developer…",    rows: 2 },
                  { key: "skills",         label: "Skills",         emoji: "⚡", ph: "React, Node.js, Python, AWS…",      rows: 2 },
                  { key: "experience",     label: "Experience",     emoji: "💼", ph: "SWE @ Infosys (2022–Now)…",        rows: 3 },
                  { key: "projects",       label: "Projects",       emoji: "🚀", ph: "E-Commerce (React+Node)…",         rows: 3 },
                  { key: "education",      label: "Education",      emoji: "🎓", ph: "B.E. CS — SPPU, Pune (2022)",       rows: 1 },
                  { key: "certifications", label: "Certifications", emoji: "🏆", ph: "AWS Developer, GCP…",              rows: 1 },
                ].map(({ key, label, emoji, ph, rows }) => (
                  <GlassTextarea
                    key={key}
                    value={profile[key as keyof CandidateProfile]}
                    onChange={v => setProfile(p => ({ ...p, [key]: v }))}
                    placeholder={ph}
                    rows={rows}
                    label={label}
                    emoji={emoji}
                  />
                ))}

                {/* GitHub + LinkedIn */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "github",   label: "GitHub",   emoji: "🐙", ph: "github.com/you" },
                    { key: "linkedin", label: "LinkedIn",  emoji: "💼", ph: "linkedin.com/in/you" },
                  ].map(({ key, label, emoji, ph }) => (
                    <GlassInput
                      key={key}
                      value={profile[key as keyof CandidateProfile]}
                      onChange={v => setProfile(p => ({ ...p, [key]: v }))}
                      placeholder={ph}
                      label={label}
                      emoji={emoji}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Footer ── */}
          <div className="px-3 pb-3 pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {!isReady && activeTab === "profile" && (
              <p className="text-[8.5px] font-semibold text-center mb-2 flex items-center justify-center gap-1.5" style={{ color: "rgba(251,191,36,0.7)" }}>
                <span>⚠</span> Fill Company & Position in Session tab first
              </p>
            )}
            <motion.button
              whileHover={isReady ? { scale: 1.02, y: -1 } : {}}
              whileTap={isReady ? { scale: 0.97 } : {}}
              onClick={handleContinue} disabled={!isReady}
              className="w-full py-3 rounded-[14px] text-[12px] font-extrabold flex items-center justify-center gap-2 relative overflow-hidden transition-all"
              style={{
                background: isReady ? "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)" : "rgba(255,255,255,0.04)",
                color: isReady ? "#fff" : "rgba(255,255,255,0.22)",
                border: isReady ? "none" : "1px solid rgba(255,255,255,0.07)",
                boxShadow: isReady ? "0 6px 24px rgba(139,92,246,0.45), 0 1px 0 rgba(255,255,255,0.2) inset" : "none",
                cursor: isReady ? "pointer" : "not-allowed",
              }}
            >
              {isReady && (
                <motion.div
                  className="absolute inset-0 w-1/3"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }}
                  animate={{ x: ["-100%", "400%"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              )}
              <span className="relative z-10 text-[14px]">{isReady ? "🔑" : "🔒"}</span>
              <span className="relative z-10">{isReady ? "Continue to API Setup →" : "Fill Company & Position first"}</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
