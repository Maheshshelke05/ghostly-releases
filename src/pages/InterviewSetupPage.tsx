import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";
import type { CandidateProfile } from "../store/useStore";

const LANGUAGES = [
  { id: "english", flag: "🇺🇸", name: "English" },
  { id: "hindi",   flag: "🇮🇳", name: "Hindi" },
  { id: "marathi", flag: "🇮🇳", name: "Marathi" },
  { id: "spanish", flag: "🇪🇸", name: "Spanish" },
  { id: "french",  flag: "🇫🇷", name: "French" },
  { id: "german",  flag: "🇩🇪", name: "German" },
  { id: "japanese",flag: "🇯🇵", name: "Japanese" },
  { id: "chinese", flag: "🇨🇳", name: "Chinese" },
];

const EMPTY_PROFILE: CandidateProfile = {
  fullName: "", email: "", phone: "", location: "",
  summary: "", skills: "", experience: "", projects: "",
  education: "", certifications: "", linkedin: "", github: "",
};

const inputStyle = (focused: boolean, filled: boolean): React.CSSProperties => ({
  background: focused ? "#f0fdf4" : "#f8fafc",
  border: `1.5px solid ${focused ? "#10b981" : filled ? "#a7f3d0" : "#e2e8f0"}`,
  color: "#0f172a", borderRadius: "9px", padding: "7px 10px",
  fontSize: "11px", fontWeight: 600, width: "100%", outline: "none", transition: "all 0.15s",
});
const taStyle = (focused: boolean, filled: boolean): React.CSSProperties => ({
  ...inputStyle(focused, filled), resize: "none" as const, lineHeight: "1.5",
});

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
    if (hasProfile) {
      setSavedProfile(profile);
      await window.ghostly.saveProfile(profile).catch(() => {});
    }
    setInterviewSession({
      companyName: companyName.trim(), position: position.trim(),
      language, description: customInstructions.trim(),
      profile: hasProfile ? profile : null,
    });
    // Fix: persist settings to disk so autoAI loads correctly on next session
    setTimeout(() => window.ghostly.saveSettings(useStore.getState().settings), 50);
    setAppScreen("api-setup");
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
        className="w-full max-w-[310px] flex flex-col gap-2"
        style={{ pointerEvents: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[16px] shrink-0"
              style={{ background: "linear-gradient(135deg, #10b981, #047857)", boxShadow: "0 3px 10px rgba(16,185,129,0.38)" }}>🎯</div>
            <div>
              <p className="text-[12px] font-extrabold text-white leading-tight">Interview Setup</p>
              <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Step 1 of 3</p>
            </div>
          </div>
          <button
            onClick={() => setAppScreen("home")}
            className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-[8px] transition-all"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
        </div>

        {/* Card — overflow-visible so language dropdown is not clipped */}
        <div className="w-full rounded-[16px]"
          style={{ background: "#fff", boxShadow: "0 12px 40px rgba(0,0,0,0.18), 0 1px 0 #fff inset", border: "1px solid rgba(255,255,255,0.9)", overflow: "visible" }}>

          {/* Tabs */}
          <div className="flex gap-1.5 px-3 pt-3">
            {([
              { id: "session" as const, label: "🎯 Session" },
              { id: "profile" as const, label: `👤 Profile${hasProfile ? " ✓" : ""}` },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex-1 py-1.5 rounded-[8px] text-[10px] font-extrabold transition-all"
                style={{
                  background: activeTab === tab.id ? "#ecfdf5" : "#f8fafc",
                  border: `1.5px solid ${activeTab === tab.id ? "#10b981" : "#e2e8f0"}`,
                  color: activeTab === tab.id ? "#059669" : "#94a3b8",
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "session" ? (
              <motion.div key="session"
                initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -5 }}
                transition={{ duration: 0.12 }}
                className="px-3 pt-2.5 pb-3 flex flex-col gap-2 max-h-[50vh] overflow-y-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {/* Company + Position */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "company",  label: "Company *",  val: companyName, set: setCompanyName, ph: "Google, TCS…" },
                    { key: "position", label: "Position *", val: position,    set: setPosition,    ph: "SWE, PM…" },
                  ].map(({ key, label, val, set, ph }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">{label}</label>
                      <input type="text" value={val} onChange={e => set(e.target.value)}
                        onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
                        placeholder={ph} className="placeholder:text-slate-300"
                        style={inputStyle(focused === key, !!val)} />
                    </div>
                  ))}
                </div>

                {/* Language */}
                <div className="flex flex-col gap-1 relative z-50">
                  <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">🌐 Language</label>
                  <button onClick={() => setLangOpen(!langOpen)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[9px] transition-all"
                    style={{ background: "#f8fafc", border: `1.5px solid ${langOpen ? "#10b981" : "#e2e8f0"}`, color: "#0f172a" }}>
                    <span className="flex items-center gap-1.5 text-[11px] font-bold">
                      {selLang.flag} {selLang.name}
                    </span>
                    <span className={`text-[8px] text-slate-400 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`}>▼</span>
                  </button>
                  <AnimatePresence>
                    {langOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.1 }}
                        className="absolute top-[calc(100%+3px)] left-0 right-0 rounded-[11px] z-50 p-1.5"
                        style={{ background: "#fff", border: "1.5px solid #e2e8f0", boxShadow: "0 10px 28px rgba(0,0,0,0.1)" }}
                      >
                        <div className="grid grid-cols-2 gap-0.5">
                          {LANGUAGES.map(l => (
                            <button key={l.id} onClick={() => { setLanguage(l.id); setLangOpen(false); }}
                              className="flex items-center gap-1.5 px-2 py-1.5 rounded-[7px] text-[10px] font-bold text-left transition-all"
                              style={{ background: language === l.id ? "#ecfdf5" : "transparent", color: language === l.id ? "#059669" : "#475569" }}>
                              {l.flag} {l.name}
                              {language === l.id && <span className="ml-auto text-emerald-500 text-[9px]">✓</span>}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Auto AI toggle */}
                <div className="flex items-center justify-between px-2.5 py-2 rounded-[10px]"
                  style={{ background: autoAI ? "#ecfdf5" : "#f8fafc", border: `1.5px solid ${autoAI ? "#6ee7b7" : "#e2e8f0"}` }}>
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-700">Auto AI Answer</p>
                    <p className="text-[8px] text-slate-400 font-medium">Responds on silence</p>
                  </div>
                  <button onClick={() => setAutoAI(!autoAI)} className="relative shrink-0"
                    style={{ width: "32px", height: "18px", background: autoAI ? "linear-gradient(135deg, #10b981, #059669)" : "#e2e8f0", borderRadius: "999px", border: "none", cursor: "pointer" }}>
                    <motion.div animate={{ x: autoAI ? 15 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white"
                      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </button>
                </div>

                {/* Custom Instructions */}
                <div className="flex flex-col gap-1">
                  <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">✏️ Custom Instructions</label>
                  <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
                    onFocus={() => setFocused("instr")} onBlur={() => setFocused(null)}
                    placeholder="Always write code in Python. Be concise…" rows={2}
                    className="placeholder:text-slate-300"
                    style={taStyle(focused === "instr", !!customInstructions)} />
                </div>
              </motion.div>
            ) : (
              <motion.div key="profile"
                initial={{ opacity: 0, x: 5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 5 }}
                transition={{ duration: 0.12 }}
                className="px-3 pt-2.5 pb-3 flex flex-col gap-2 max-h-[50vh] overflow-y-auto"
                style={{ scrollbarWidth: "none" }}
              >
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px]"
                  style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                  <span className="text-[11px]">💡</span>
                  <p className="text-[8px] font-medium text-blue-700">AI speaks <b>as you</b> using your real profile.</p>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: "fullName", label: "👤 Name",     ph: "Rahul Sharma" },
                    { key: "location", label: "📍 Location", ph: "Pune, India" },
                    { key: "email",    label: "📧 Email",    ph: "you@email.com" },
                    { key: "phone",    label: "📱 Phone",    ph: "+91 98765…" },
                  ].map(({ key, label, ph }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">{label}</label>
                      <input type="text" value={profile[key as keyof CandidateProfile]}
                        onChange={setField(key as keyof CandidateProfile)}
                        onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
                        placeholder={ph} className="placeholder:text-slate-300"
                        style={inputStyle(focused === key, !!profile[key as keyof CandidateProfile])} />
                    </div>
                  ))}
                </div>

                {[
                  { key: "summary",        label: "📝 Summary",        ph: "3+ years full-stack developer…",          rows: 2 },
                  { key: "skills",         label: "⚡ Skills",          ph: "React, Node.js, Python, AWS…",            rows: 2 },
                  { key: "experience",     label: "💼 Experience",      ph: "SWE @ Infosys (2022–Now)\n- Built APIs…", rows: 3 },
                  { key: "projects",       label: "🚀 Projects",        ph: "E-Commerce (React+Node)\n- 40% faster…",  rows: 3 },
                  { key: "education",      label: "🎓 Education",       ph: "B.E. CS — SPPU, Pune (2022)",             rows: 1 },
                  { key: "certifications", label: "🏆 Certifications",  ph: "AWS Developer, GCP…",                     rows: 1 },
                ].map(({ key, label, ph, rows }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">{label}</label>
                    <textarea value={profile[key as keyof CandidateProfile]}
                      onChange={setField(key as keyof CandidateProfile)}
                      onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
                      placeholder={ph} rows={rows} className="placeholder:text-slate-300"
                      style={taStyle(focused === key, !!profile[key as keyof CandidateProfile])} />
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: "github",   label: "🐙 GitHub",   ph: "github.com/you" },
                    { key: "linkedin", label: "💼 LinkedIn", ph: "linkedin.com/in/you" },
                  ].map(({ key, label, ph }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">{label}</label>
                      <input type="text" value={profile[key as keyof CandidateProfile]}
                        onChange={setField(key as keyof CandidateProfile)}
                        onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
                        placeholder={ph} className="placeholder:text-slate-300"
                        style={inputStyle(focused === key, !!profile[key as keyof CandidateProfile])} />
                    </div>
                  ))}
                </div>

                {hasProfile && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px]"
                    style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                    <span className="text-emerald-500 font-black text-[10px]">✓</span>
                    <span className="text-[8px] font-semibold text-emerald-700">Profile saved — AI will use your info</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="px-3 pb-3 pt-2" style={{ borderTop: "1px solid #f1f5f9" }}>
            {!isReady && activeTab === "profile" && (
              <p className="text-[8px] text-amber-500 font-semibold text-center mb-1.5">⚠ Fill Company & Position in Session tab first</p>
            )}
            <motion.button
              whileHover={isReady ? { scale: 1.02, y: -1 } : {}}
              whileTap={isReady ? { scale: 0.98 } : {}}
              onClick={handleContinue}
              disabled={!isReady}
              className="w-full py-2.5 rounded-[11px] text-[12px] font-extrabold flex items-center justify-center gap-2 relative overflow-hidden group transition-all"
              style={{
                background: isReady ? "linear-gradient(135deg, #10b981, #059669)" : "#f1f5f9",
                color: isReady ? "#fff" : "#94a3b8",
                boxShadow: isReady ? "0 5px 18px rgba(16,185,129,0.32)" : "none",
                cursor: isReady ? "pointer" : "not-allowed", border: "none",
              }}
            >
              {isReady && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[200%] skew-x-[25deg] group-hover:translate-x-[200%] transition-transform duration-600" />}
              <span className="text-[14px]">{isReady ? "🔑" : "🔒"}</span>
              {isReady ? "Continue to API Setup →" : "Fill Company & Position first"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
