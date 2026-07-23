import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface QAPair {
  question: string;
  answer: string;
  feature: "ai-answer" | "screen" | "chat" | "follow-up";
  timestamp: number;
}

interface InterviewRecord {
  id: string;
  timestamp: number;
  solution: string;
  provider: string;
  model: string;
  interviewType: string;
  language: string;
  companyName?: string;
  position?: string;
  durationSeconds?: number;
  featuresUsed?: ("ai-answer" | "screen" | "chat")[];
  qaHistory?: QAPair[];
}

/* ─── Design system ─── */
const GLASS: React.CSSProperties = {
  background: "rgba(10,10,18,0.97)",
  backdropFilter: "blur(32px)",
  WebkitBackdropFilter: "blur(32px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 32px 80px rgba(0,0,0,0.75), 0 1px 0 rgba(255,255,255,0.06) inset",
};

const FEATURE_LABELS: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  "ai-answer": { icon: "🎙️", label: "AI Answer", color: "#a78bfa", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.3)" },
  "screen":    { icon: "🖥️", label: "Screen AI",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.3)"  },
  "chat":      { icon: "💬", label: "AI Chat",    color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)"  },
  "follow-up": { icon: "🔄", label: "Follow-up",  color: "#fb923c", bg: "rgba(251,146,60,0.12)", border: "rgba(251,146,60,0.3)"  },
};

const TYPE_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  "dsa":           { label: "DSA",           color: "#a78bfa", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.28)" },
  "system_design": { label: "System Design", color: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.28)"  },
  "frontend":      { label: "Frontend",      color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.28)"  },
  "sql":           { label: "SQL",           color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.28)"  },
  "behavioral":    { label: "Behavioral",    color: "#fb923c", bg: "rgba(251,146,60,0.12)", border: "rgba(251,146,60,0.28)"  },
  "live-interview":{ label: "Live Interview",color: "#f472b6", bg: "rgba(244,114,182,0.12)",border: "rgba(244,114,182,0.28)" },
};

function typeStyle(type: string) {
  return TYPE_STYLES[type] || { label: type, color: "#a78bfa", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.28)" };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function formatDuration(secs?: number) {
  if (!secs) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* ─── Company initials avatar ─── */
function CompanyAvatar({ name }: { name?: string }) {
  const initials = name ? name.slice(0, 2).toUpperCase() : "IN";
  return (
    <div
      className="w-11 h-11 rounded-[14px] flex items-center justify-center text-[14px] font-black shrink-0 relative"
      style={{
        background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.15))",
        border: "1px solid rgba(139,92,246,0.3)",
        color: "#c4b5fd",
        boxShadow: "0 0 14px rgba(139,92,246,0.15)",
      }}
    >
      {initials}
    </div>
  );
}

interface Props { open: boolean; onClose: () => void; }

export const InterviewHistoryModal: React.FC<Props> = ({ open, onClose }) => {
  const [records, setRecords]     = useState<InterviewRecord[]>([]);
  const [selected, setSelected]   = useState<InterviewRecord | null>(null);
  const [expandedQA, setExpandedQA] = useState<number | null>(null);
  const [loading, setLoading]     = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(null);
    setExpandedQA(null);
    try {
      window.ghostly.getHistory().then((h: InterviewRecord[]) => {
        setRecords(Array.isArray(h) ? h.sort((a, b) => b.timestamp - a.timestamp) : []);
        setLoading(false);
      }).catch(() => setLoading(false));
    } catch { setLoading(false); }
  }, [open]);

  const handleClearAll = async () => {
    await window.ghostly.saveHistory([]).catch(() => {});
    setRecords([]); setSelected(null); setConfirmClear(false);
  };

  const handleDeleteOne = async (id: string) => {
    const next = records.filter(r => r.id !== id);
    await window.ghostly.saveHistory(next).catch(() => {});
    setRecords(next);
    if (selected?.id === id) setSelected(null);
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998]"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 24 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ pointerEvents: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
          >
            <div
              className="w-full flex flex-col rounded-[26px] overflow-hidden relative"
              style={{
                ...GLASS,
                maxWidth: selected ? "740px" : "450px",
                maxHeight: "84vh",
                pointerEvents: "auto",
                transition: "max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={() => window.ghostly.enableMouse()}
            >
              {/* Violet accent top bar */}
              <div className="h-0.5 w-full shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.8), rgba(99,102,241,0.6), transparent)" }} />

              {/* ── Header ── */}
              <div
                className="flex items-center justify-between px-5 py-4 shrink-0"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-3">
                  {selected && (
                    <button
                      onClick={() => { setSelected(null); setExpandedQA(null); }}
                      className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.12)"; e.currentTarget.style.color = "#a78bfa"; e.currentTarget.style.borderColor = "rgba(139,92,246,0.3)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                    </button>
                  )}
                  <div>
                    <h2 className="text-[16px] font-black leading-tight" style={{ color: "rgba(255,255,255,0.92)" }}>
                      {selected ? (selected.companyName || "Interview Session") : "Last Interviews"}
                    </h2>
                    <p className="text-[10.5px] font-semibold mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {selected
                        ? `${formatDate(selected.timestamp)} · ${formatTime(selected.timestamp)}`
                        : `${records.length} session${records.length !== 1 ? "s" : ""} saved`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!selected && records.length > 0 && (
                    confirmClear ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Sure?</span>
                        <button
                          onClick={handleClearAll}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                          style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
                        >Yes, Clear</button>
                        <button
                          onClick={() => setConfirmClear(false)}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                          style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClear(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                        style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)"; }}
                      >
                        🗑 Clear All
                      </button>
                    )
                  )}
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#f87171"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              {/* ── Body ── */}
              <div
                className="flex-1 min-h-0 overflow-y-auto"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(139,92,246,0.25) transparent" }}
              >
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
                    <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Loading history…</span>
                  </div>
                ) : records.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
                    <div
                      className="w-16 h-16 rounded-[20px] flex items-center justify-center text-4xl"
                      style={{
                        background: "rgba(139,92,246,0.08)",
                        border: "1px solid rgba(139,92,246,0.2)",
                        boxShadow: "0 0 24px rgba(139,92,246,0.1)",
                      }}
                    >📭</div>
                    <div>
                      <p className="text-[15px] font-black" style={{ color: "rgba(255,255,255,0.7)" }}>No interviews yet</p>
                      <p className="text-[12px] font-medium mt-1 max-w-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.3)" }}>
                        Complete an interview session and your history will appear here.
                      </p>
                    </div>
                  </div>
                ) : selected ? (
                  <DetailView
                    record={selected}
                    expandedQA={expandedQA}
                    setExpandedQA={setExpandedQA}
                    onDelete={() => handleDeleteOne(selected.id)}
                  />
                ) : (
                  /* ── List View ── */
                  <div className="p-3 flex flex-col gap-2">
                    {records.map((rec, idx) => {
                      const ts = typeStyle(rec.interviewType);
                      const dur = formatDuration(rec.durationSeconds);
                      return (
                        <motion.button
                          key={rec.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          onClick={() => { setSelected(rec); setExpandedQA(null); }}
                          className="w-full text-left rounded-[18px] p-4 transition-all outline-none group relative overflow-hidden"
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.07)",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = "rgba(139,92,246,0.06)";
                            e.currentTarget.style.borderColor = "rgba(139,92,246,0.22)";
                            e.currentTarget.style.boxShadow = "0 0 20px rgba(139,92,246,0.08)";
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            {/* Left */}
                            <div className="flex items-start gap-3 min-w-0">
                              <CompanyAvatar name={rec.companyName} />
                              <div className="min-w-0 pt-0.5">
                                <p className="text-[13.5px] font-black leading-tight truncate" style={{ color: "rgba(255,255,255,0.88)" }}>
                                  {rec.companyName || "Interview Session"}
                                </p>
                                {rec.position && (
                                  <p className="text-[11px] font-semibold truncate mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{rec.position}</p>
                                )}
                                {/* Feature chips */}
                                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                                  <span
                                    className="text-[9.5px] font-black px-2 py-0.5 rounded-full"
                                    style={{ background: ts.bg, color: ts.color, border: `1px solid ${ts.border}` }}
                                  >
                                    {ts.label}
                                  </span>
                                  {rec.featuresUsed?.map(f => {
                                    const fl = FEATURE_LABELS[f];
                                    return (
                                      <span
                                        key={f}
                                        className="text-[9.5px] font-black px-2 py-0.5 rounded-full flex items-center gap-1"
                                        style={{ background: fl?.bg, color: fl?.color, border: `1px solid ${fl?.border}` }}
                                      >
                                        {fl?.icon} {fl?.label}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* Right */}
                            <div className="shrink-0 text-right flex flex-col items-end gap-1">
                              <span className="text-[12px] font-black" style={{ color: "rgba(255,255,255,0.82)" }}>
                                {formatDate(rec.timestamp)}
                              </span>
                              <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.38)" }}>
                                {formatTime(rec.timestamp)}
                              </span>
                              {dur && (
                                <span
                                  className="text-[9.5px] font-bold px-2 py-0.5 rounded-full mt-1.5 flex items-center gap-1"
                                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
                                >
                                  ⏱ {dur}
                                </span>
                              )}
                              {rec.qaHistory && rec.qaHistory.length > 0 && (
                                <span className="text-[9.5px] font-semibold mt-0.5" style={{ color: "rgba(167,139,250,0.55)" }}>
                                  {rec.qaHistory.length} Q&A
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Arrow indicator */}
                          <div
                            className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: "rgba(167,139,250,0.6)" }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

/* ─── Detail View ─── */
const DetailView: React.FC<{
  record: InterviewRecord;
  expandedQA: number | null;
  setExpandedQA: (i: number | null) => void;
  onDelete: () => void;
}> = ({ record, expandedQA, setExpandedQA, onDelete }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const ts = typeStyle(record.interviewType);

  const copyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {}
  };

  const infoRows = [
    { label: "Company",  value: record.companyName || "—",    icon: "🏢" },
    { label: "Position", value: record.position    || "—",    icon: "💼" },
    { label: "Date",     value: formatDate(record.timestamp), icon: "📅" },
    { label: "Time",     value: formatTime(record.timestamp), icon: "🕐" },
    { label: "Type",     value: ts.label,                     icon: "📂" },
    { label: "Duration", value: formatDuration(record.durationSeconds) || "—", icon: "⏱" },
    { label: "AI Model", value: record.model,                 icon: "🤖" },
    { label: "Provider", value: record.provider,              icon: "⚡" },
  ];

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* ── Session info ── */}
      <div
        className="rounded-[20px] p-4 flex flex-col gap-4"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Grid of info fields */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
          {infoRows.map(({ label, value, icon }) => (
            <div key={label}>
              <p className="text-[8.5px] font-black uppercase tracking-[0.12em] mb-1 flex items-center gap-1" style={{ color: "rgba(255,255,255,0.28)" }}>
                <span>{icon}</span> {label}
              </p>
              <p className="text-[12.5px] font-bold truncate leading-tight" style={{ color: "rgba(255,255,255,0.82)" }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Features used */}
        {record.featuresUsed && record.featuresUsed.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "14px" }}>
            <p className="text-[8.5px] font-black uppercase tracking-[0.12em] mb-2.5" style={{ color: "rgba(255,255,255,0.28)" }}>
              Features Used
            </p>
            <div className="flex flex-wrap gap-2">
              {record.featuresUsed.map(f => {
                const fl = FEATURE_LABELS[f];
                return (
                  <span
                    key={f}
                    className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl"
                    style={{ background: fl?.bg, color: fl?.color, border: `1px solid ${fl?.border}` }}
                  >
                    {fl?.icon} {fl?.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Q&A History ── */}
      {record.qaHistory && record.qaHistory.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.35)" }}>
              Q&A History
            </p>
            <span
              className="text-[9.5px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}
            >
              {record.qaHistory.length} exchange{record.qaHistory.length !== 1 ? "s" : ""}
            </span>
          </div>

          {record.qaHistory.map((qa, i) => {
            const isOpen = expandedQA === i;
            const feat = FEATURE_LABELS[qa.feature] || FEATURE_LABELS["follow-up"];
            return (
              <motion.div
                key={i}
                layout
                className="rounded-[16px] overflow-hidden transition-all"
                style={{
                  background: isOpen ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.03)",
                  border: isOpen ? `1px solid ${feat.border}` : "1px solid rgba(255,255,255,0.07)",
                  boxShadow: isOpen ? `0 0 16px ${feat.bg}` : "none",
                }}
              >
                {/* Question header */}
                <button className="w-full flex items-start gap-3 p-4 text-left outline-none" onClick={() => setExpandedQA(isOpen ? null : i)}>
                  <div
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[14px] shrink-0 mt-0.5"
                    style={{ background: feat.bg, border: `1px solid ${feat.border}` }}
                  >
                    {feat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: feat.color }}>{feat.label}</span>
                      <span className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.28)" }}>{formatTime(qa.timestamp)}</span>
                    </div>
                    <p className="text-[12.5px] font-semibold leading-snug line-clamp-2" style={{ color: "rgba(255,255,255,0.78)" }}>{qa.question}</p>
                  </div>
                  <div
                    className="shrink-0 mt-1.5 w-6 h-6 flex items-center justify-center rounded-full transition-all"
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "none",
                      background: isOpen ? feat.bg : "rgba(255,255,255,0.05)",
                      border: isOpen ? `1px solid ${feat.border}` : "1px solid rgba(255,255,255,0.08)",
                      color: isOpen ? feat.color : "rgba(255,255,255,0.3)",
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </button>

                {/* Expanded content */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }}
                    >
                      <div className="px-4 pb-4 flex flex-col gap-2.5">
                        {/* Full question */}
                        <div
                          className="rounded-[13px] p-3.5"
                          style={{
                            background: "rgba(251,191,36,0.06)",
                            border: "1px solid rgba(251,191,36,0.2)",
                            borderLeft: "3px solid rgba(251,191,36,0.6)",
                          }}
                        >
                          <p className="text-[8.5px] font-black uppercase tracking-widest mb-2" style={{ color: "rgba(251,191,36,0.6)" }}>🎙️ Full Question</p>
                          <p className="text-[12.5px] leading-relaxed font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>{qa.question}</p>
                        </div>

                        {/* AI Answer */}
                        <div
                          className="rounded-[13px] p-3.5 relative"
                          style={{
                            background: "rgba(139,92,246,0.07)",
                            border: "1px solid rgba(139,92,246,0.2)",
                            borderLeft: "3px solid rgba(139,92,246,0.6)",
                          }}
                        >
                          <div className="flex items-center justify-between mb-2.5">
                            <p className="text-[8.5px] font-black uppercase tracking-widest" style={{ color: "rgba(167,139,250,0.7)" }}>🤖 Ghostly AI Answer</p>
                            <button
                              onClick={() => copyText(qa.answer, i)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9.5px] font-bold transition-all"
                              style={{
                                background: copiedIdx === i ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)",
                                border: copiedIdx === i ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.09)",
                                color: copiedIdx === i ? "#4ade80" : "rgba(255,255,255,0.5)",
                              }}
                            >
                              {copiedIdx === i ? "✓ Copied!" : "Copy"}
                            </button>
                          </div>
                          <p
                            className="text-[12.5px] font-medium leading-relaxed whitespace-pre-wrap"
                            style={{
                              color: "rgba(255,255,255,0.72)",
                              maxHeight: "260px",
                              overflowY: "auto",
                              scrollbarWidth: "thin",
                              scrollbarColor: "rgba(139,92,246,0.25) transparent",
                            }}
                          >{qa.answer}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div
          className="flex flex-col items-center gap-3 py-10 text-center rounded-[18px]"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span className="text-3xl">📝</span>
          <p className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>No Q&A pairs recorded for this session.</p>
        </div>
      )}

      {/* ── Delete button ── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px" }}>
        {confirmDelete ? (
          <div className="flex items-center gap-3 justify-center">
            <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Delete session forever?</span>
            <button
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="px-4 py-2 rounded-xl text-[11px] font-bold transition-all"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
            >Yes, Delete</button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-xl text-[11px] font-bold transition-all"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
            >Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-2.5 rounded-[13px] text-[12px] font-bold transition-all flex items-center justify-center gap-2"
            style={{
              background: "rgba(239,68,68,0.07)",
              color: "#f87171",
              border: "1px solid rgba(239,68,68,0.18)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.14)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.07)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.18)"; }}
          >
            🗑 Delete This Session
          </button>
        )}
      </div>
    </div>
  );
};
