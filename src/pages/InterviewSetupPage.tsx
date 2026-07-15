import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";
import type { CandidateProfile } from "../store/useStore";

const BASE = "#1b1b26";
const nm = (raised = true) =>
  raised
    ? "6px 6px 14px rgba(0,0,0,0.55), -3px -3px 8px rgba(255,255,255,0.04)"
    : "inset 4px 4px 10px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.04)";

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
  const [focused, setFocused]         = useState<string | null>(null);

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

  const nmInput = (focused: boolean): React.CSSProperties => ({
    background: BASE,
    boxShadow: focused
      ? `${nm(false)}, 0 0 0 1.5px rgba(235,146,69,0.4)`
      : nm(false),
    border: "none",
    color: "rgba(255,255,255,0.8)",
    borderRadius: "9px",
    padding: "7px 10px",
    fontSize: "11px",
    fontWeight: 600,
    width: "100%",
    outline: "none",
    transition: "box-shadow 0.15s",
  });

  const nmTextarea = (focused: boolean): React.CSSProperties => ({
    ...nmInput(focused), resize: "none" as const, lineHeight: "1.5",
  });

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
        className="w-full max-w-[310px] flex flex-col gap-2"
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
                background: "linear-gradient(135deg, #eb9245, #d97706)",
                boxShadow: "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 16px rgba(235,146,69,0.25)",
              }}
            >🎯</div>
            <div>
              <p className="text-[12px] font-extrabold text-white leading-tight">Interview Setup</p>
              <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.28)" }}>Step 1 of 3</p>
            </div>
          </div>
          <button
            onClick={() => setAppScreen("home")}
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
        <div
          className="w-full rounded-[18px]"
          style={{ background: BASE, boxShadow: nm(), overflow: "visible" }}
        >
          {/* Tabs */}
          <div className="flex gap-2 px-3 pt-3">
            {([
              { id: "session" as const, icon: "🎯", label: "Session" },
              { id: "profile" as const, icon: "👤", label: `Profile${hasProfile ? " ✓" : ""}` },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 py-1.5 rounded-[10px] text-[10px] font-extrabold transition-all flex items-center justify-center gap-1.5"
                style={{
                  background: BASE,
                  boxShadow: activeTab === tab.id ? nm(false) : nm(),
                  color: activeTab === tab.id ? "#eb9245" : "rgba(255,255,255,0.3)",
                  border: "none",
                }}
              >
                <span>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "session" ? (
              <motion.div
                key="session"
                initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -5 }}
                transition={{ duration: 0.12 }}
                className="px-3 pt-3 pb-3 flex flex-col gap-2.5 max-h-[52vh] overflow-y-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {/* Company + Position */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "company",  label: "Company *",  val: companyName, set: setCompanyName, ph: "Google, TCS…" },
                    { key: "position", label: "Position *", val: position,    set: setPosition,    ph: "SWE, PM…"   },
                  ].map(({ key, label, val, set, ph }) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      <label className={LABEL} style={LC}>{label}</label>
                      <input
                        type="text" value={val} onChange={e => set(e.target.value)}
                        onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
                        placeholder={ph} className="placeholder:text-white/15"
                        style={nmInput(focused === key)}
                      />
                    </div>
                  ))}
                </div>

                {/* Language */}
                <div className="flex flex-col gap-1.5 relative z-50">
                  <label className={LABEL} style={LC}>🌐 Language</label>
                  <button
                    onClick={() => setLangOpen(!langOpen)}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-[9px] transition-all"
                    style={{
                      background: BASE,
                      boxShadow: langOpen ? `${nm(false)}, 0 0 0 1.5px rgba(235,146,69,0.4)` : nm(false),
                      color: "rgba(255,255,255,0.75)",
                      border: "none",
                    }}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-bold">{selLang.flag} {selLang.name}</span>
                    <span className={`text-[8px] transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`} style={{ color: "rgba(255,255,255,0.3)" }}>▼</span>
                  </button>
                  <AnimatePresence>
                    {langOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.1 }}
                        className="absolute top-[calc(100%+4px)] left-0 right-0 rounded-[13px] z-50 p-2"
                        style={{ background: BASE, boxShadow: "8px 8px 20px rgba(0,0,0,0.6), -3px -3px 8px rgba(255,255,255,0.04)" }}
                      >
                        <div className="grid grid-cols-2 gap-1">
                          {LANGUAGES.map(l => (
                            <button
                              key={l.id}
                              onClick={() => { setLanguage(l.id); setLangOpen(false); }}
                              className="flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] text-[10px] font-bold text-left transition-all"
                              style={{
                                background: BASE,
                                boxShadow: language === l.id ? nm(false) : "none",
                                color: language === l.id ? "#eb9245" : "rgba(255,255,255,0.5)",
                                border: "none",
                              }}
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
                  className="flex items-center justify-between px-2.5 py-2.5 rounded-[11px]"
                  style={{ background: BASE, boxShadow: nm(false) }}
                >
                  <div>
                    <p className="text-[10px] font-extrabold" style={{ color: autoAI ? "#eb9245" : "rgba(255,255,255,0.6)" }}>
                      Auto AI Answer
                    </p>
                    <p className="text-[8px] font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                      Responds after silence
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoAI(!autoAI)}
                    style={{
                      width: "34px", height: "19px",
                      background: autoAI ? "linear-gradient(135deg, #eb9245, #d97706)" : BASE,
                      boxShadow: autoAI ? "0 0 14px rgba(235,146,69,0.35)" : nm(false),
                      borderRadius: "999px", border: "none", cursor: "pointer", position: "relative",
                    }}
                  >
                    <motion.div
                      animate={{ x: autoAI ? 16 : 2 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      style={{
                        position: "absolute", top: "2.5px",
                        width: "14px", height: "14px",
                        borderRadius: "50%", background: "#fff",
                        boxShadow: "1px 1px 4px rgba(0,0,0,0.4)",
                      }}
                    />
                  </button>
                </div>

                {/* Custom Instructions */}
                <div className="flex flex-col gap-1.5">
                  <label className={LABEL} style={LC}>✏️ Custom Instructions</label>
                  <textarea
                    value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
                    onFocus={() => setFocused("instr")} onBlur={() => setFocused(null)}
                    placeholder="Always write code in Python…" rows={2}
                    className="placeholder:text-white/15"
                    style={nmTextarea(focused === "instr")}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 5 }}
                transition={{ duration: 0.12 }}
                className="px-3 pt-3 pb-3 flex flex-col gap-2 max-h-[52vh] overflow-y-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {/* Banner */}
                <div
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-[9px]"
                  style={{ background: BASE, boxShadow: nm(false) }}
                >
                  <span className="text-[11px]">{hasProfile ? "✓" : "💡"}</span>
                  <p className="text-[8px] font-semibold" style={{ color: hasProfile ? "#eb9245" : "rgba(255,255,255,0.38)" }}>
                    {hasProfile ? "Profile saved — AI speaks as you" : "AI speaks as you using your profile."}
                  </p>
                </div>

                {/* Name/Location/Email/Phone */}
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: "fullName", label: "👤 Name",     ph: "Rahul Sharma"   },
                    { key: "location", label: "📍 Location", ph: "Pune, India"    },
                    { key: "email",    label: "📧 Email",    ph: "you@email.com"  },
                    { key: "phone",    label: "📱 Phone",    ph: "+91 98765…"     },
                  ].map(({ key, label, ph }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className={LABEL} style={LC}>{label}</label>
                      <input
                        type="text" value={profile[key as keyof CandidateProfile]}
                        onChange={setField(key as keyof CandidateProfile)}
                        onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
                        placeholder={ph} className="placeholder:text-white/15"
                        style={nmInput(focused === key)}
                      />
                    </div>
                  ))}
                </div>

                {/* Textareas */}
                {[
                  { key: "summary",        label: "📝 Summary",       ph: "3+ years full-stack developer…",          rows: 2 },
                  { key: "skills",         label: "⚡ Skills",         ph: "React, Node.js, Python, AWS…",            rows: 2 },
                  { key: "experience",     label: "💼 Experience",     ph: "SWE @ Infosys (2022–Now)…",              rows: 3 },
                  { key: "projects",       label: "🚀 Projects",       ph: "E-Commerce (React+Node)…",               rows: 3 },
                  { key: "education",      label: "🎓 Education",      ph: "B.E. CS — SPPU, Pune (2022)",             rows: 1 },
                  { key: "certifications", label: "🏆 Certifications", ph: "AWS Developer, GCP…",                     rows: 1 },
                ].map(({ key, label, ph, rows }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className={LABEL} style={LC}>{label}</label>
                    <textarea
                      value={profile[key as keyof CandidateProfile]}
                      onChange={setField(key as keyof CandidateProfile)}
                      onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
                      placeholder={ph} rows={rows} className="placeholder:text-white/15"
                      style={nmTextarea(focused === key)}
                    />
                  </div>
                ))}

                {/* GitHub + LinkedIn */}
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: "github",   label: "🐙 GitHub",   ph: "github.com/you"      },
                    { key: "linkedin", label: "💼 LinkedIn",  ph: "linkedin.com/in/you" },
                  ].map(({ key, label, ph }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className={LABEL} style={LC}>{label}</label>
                      <input
                        type="text" value={profile[key as keyof CandidateProfile]}
                        onChange={setField(key as keyof CandidateProfile)}
                        onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
                        placeholder={ph} className="placeholder:text-white/15"
                        style={nmInput(focused === key)}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="px-3 pb-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            {!isReady && activeTab === "profile" && (
              <p className="text-[8px] font-semibold text-center mb-1.5 flex items-center justify-center gap-1" style={{ color: "rgba(235,146,69,0.6)" }}>
                ⚠ Fill Company & Position in Session tab first
              </p>
            )}
            <motion.button
              whileHover={isReady ? { scale: 1.02 } : {}}
              whileTap={isReady ? { scale: 0.97 } : {}}
              onClick={handleContinue} disabled={!isReady}
              className="w-full py-2.5 rounded-[12px] text-[12px] font-extrabold flex items-center justify-center gap-2 transition-all"
              style={{
                background: isReady ? "linear-gradient(135deg, #eb9245 0%, #d97706 100%)" : BASE,
                color: isReady ? "#fff" : "rgba(255,255,255,0.2)",
                boxShadow: isReady
                  ? "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 18px rgba(235,146,69,0.28)"
                  : nm(false),
                border: "none",
                cursor: isReady ? "pointer" : "not-allowed",
              }}
            >
              <span className="text-[14px]">{isReady ? "🔑" : "🔒"}</span>
              {isReady ? "Continue to API Setup →" : "Fill Company & Position first"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
