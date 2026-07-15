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

const BASE = "#1c1917";
const nm = (raised = true) =>
  raised
    ? "6px 6px 14px rgba(0,0,0,0.55), -3px -3px 8px rgba(255,255,255,0.04)"
    : "inset 4px 4px 10px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.04)";

const FEATURE_LABELS: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  "ai-answer": { icon: "🎙️", label: "AI Answer",    color: "#4ade80", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.2)" },
  "screen":    { icon: "🖥️", label: "Screen AI",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.2)" },
  "chat":      { icon: "💬", label: "AI Chat",       color: "#c8894a", bg: "rgba(200,137,74,0.1)", border: "rgba(200,137,74,0.2)" },
  "follow-up": { icon: "🔄", label: "Follow-up",     color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.2)" },
};

const TYPE_LABELS: Record<string, string> = {
  "dsa": "DSA", "system_design": "System Design", "frontend": "Frontend",
  "sql": "SQL", "behavioral": "Behavioral", "live-interview": "Live Interview",
};

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function formatDuration(secs?: number) {
  if (!secs) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export const InterviewHistoryModal: React.FC<Props> = ({ open, onClose }) => {
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [selected, setSelected] = useState<InterviewRecord | null>(null);
  const [expandedQA, setExpandedQA] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
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
    setRecords([]);
    setSelected(null);
    setConfirmClear(false);
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
            style={{ background: "transparent" }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 font-sans text-white"
            style={{ pointerEvents: "none" }}
          >
            <div
              className="w-full flex flex-col rounded-[24px] overflow-hidden"
              style={{
                maxWidth: selected ? "720px" : "440px",
                maxHeight: "82vh",
                pointerEvents: "auto",
                background: BASE,
                boxShadow: nm(),
                transition: "max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={() => window.ghostly.enableMouse()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-[#0c0a09]/40 relative z-10" style={{ flexShrink: 0 }}>
                <div className="flex items-center gap-4">
                  {selected && (
                    <button
                      onClick={() => { setSelected(null); setExpandedQA(null); }}
                      className="w-8 h-8 flex items-center justify-center rounded-xl transition-all outline-none"
                      style={{ background: BASE, boxShadow: nm(), color: "rgba(255,255,255,0.4)" }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                    </button>
                  )}
                  <div>
                    <h2 className="text-[17px] font-black text-white/95 leading-tight">
                      {selected ? (selected.companyName || "Interview Session") : "📋 Last Interviews"}
                    </h2>
                    <p className="text-[11px] font-bold mt-1 text-white/40">
                      {selected
                        ? `${formatDate(selected.timestamp)} · ${formatTime(selected.timestamp)}`
                        : `${records.length} session${records.length !== 1 ? "s" : ""} saved`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!selected && records.length > 0 && (
                    confirmClear ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-white/40">Sure?</span>
                        <button onClick={handleClearAll}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shadow-sm"
                          style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
                          Yes, Clear
                        </button>
                        <button onClick={() => setConfirmClear(false)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                          style={{ background: BASE, color: "rgba(255,255,255,0.5)", boxShadow: nm() }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmClear(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                        style={{ background: BASE, color: "#f87171", boxShadow: nm() }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); }}>
                        🗑 Clear All
                      </button>
                    )
                  )}
                  <button onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-xl transition-all outline-none"
                    style={{ background: BASE, color: "rgba(255,255,255,0.3)", boxShadow: nm() }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); e.currentTarget.style.color = "#f87171"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
                {loading ? (
                  <div className="flex items-center justify-center py-20 gap-3">
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8894a" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    <span className="text-[13px] font-bold text-white/40">Loading history…</span>
                  </div>
                ) : records.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
                    <div className="text-6xl drop-shadow-sm">📭</div>
                    <p className="text-[16px] font-black text-white/80">No interviews yet</p>
                    <p className="text-[13px] font-medium text-white/35 max-w-xs leading-relaxed">
                      Complete an interview session and your history will appear here.
                    </p>
                  </div>
                ) : selected ? (
                  /* Detail View */
                  <DetailView
                    record={selected}
                    expandedQA={expandedQA}
                    setExpandedQA={setExpandedQA}
                    onDelete={() => handleDeleteOne(selected.id)}
                  />
                ) : (
                  /* List View */
                  <div className="p-4 flex flex-col gap-3">
                    {records.map((rec, idx) => (
                      <motion.button
                        key={rec.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04, duration: 0.2 }}
                        onClick={() => { setSelected(rec); setExpandedQA(null); }}
                        className="w-full text-left rounded-[16px] p-4 transition-all outline-none"
                        style={{ background: BASE, boxShadow: nm() }}
                        onMouseEnter={e => {
                          e.currentTarget.style.boxShadow = nm(false);
                          e.currentTarget.style.transform = "translateY(0.5px)";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.boxShadow = nm();
                          e.currentTarget.style.transform = "none";
                        }}
                      >
                        <div className="flex items-start justify-between gap-4 relative z-10">
                          {/* Left */}
                          <div className="flex items-start gap-4 min-w-0">
                            <div className="w-11 h-11 rounded-[12px] flex items-center justify-center text-[20px] shrink-0"
                              style={{ background: BASE, boxShadow: nm(false) }}>
                              🏢
                            </div>
                            <div className="min-w-0">
                              <p className="text-[14px] font-black text-white/85 truncate leading-tight">
                                {rec.companyName || "Interview Session"}
                              </p>
                              {rec.position && (
                                <p className="text-[12px] font-bold text-white/45 truncate mt-1">{rec.position}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-md"
                                  style={{ background: BASE, color: "#c8894a", boxShadow: nm(false) }}>
                                  {TYPE_LABELS[rec.interviewType] || rec.interviewType}
                                </span>
                                {rec.featuresUsed?.map(f => (
                                  <span key={f} className="text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"
                                    style={{ background: BASE, color: FEATURE_LABELS[f]?.color, boxShadow: nm(false) }}>
                                    {FEATURE_LABELS[f]?.icon} {FEATURE_LABELS[f]?.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Right */}
                          <div className="shrink-0 text-right flex flex-col items-end gap-1">
                            <span className="text-[12px] font-black text-white/85">{formatDate(rec.timestamp)}</span>
                            <span className="text-[10px] font-bold text-white/45">{formatTime(rec.timestamp)}</span>
                            {formatDuration(rec.durationSeconds) && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md mt-1.5"
                                style={{ background: BASE, color: "rgba(255,255,255,0.5)", boxShadow: nm(false) }}>
                                ⏱ {formatDuration(rec.durationSeconds)}
                              </span>
                            )}
                            {rec.qaHistory && rec.qaHistory.length > 0 && (
                              <span className="text-[10px] font-bold text-white/30 mt-1">{rec.qaHistory.length} Q&amp;A</span>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    ))}
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

/* Detail View */
const DetailView: React.FC<{
  record: InterviewRecord;
  expandedQA: number | null;
  setExpandedQA: (i: number | null) => void;
  onDelete: () => void;
}> = ({ record, expandedQA, setExpandedQA, onDelete }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyText = async (text: string, idx: number) => {
    try { await navigator.clipboard.writeText(text); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); } catch {}
  };

  return (
    <div className="p-5 flex flex-col gap-6" style={{ background: BASE }}>
      {/* Session Info Card */}
      <div className="rounded-[16px] p-5 flex flex-col gap-4"
        style={{ background: BASE, boxShadow: nm(false) }}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {[
            { label: "Company",    value: record.companyName || "—" },
            { label: "Position",   value: record.position    || "—" },
            { label: "Date",       value: formatDate(record.timestamp) },
            { label: "Time",       value: formatTime(record.timestamp) },
            { label: "Type",       value: TYPE_LABELS[record.interviewType] || record.interviewType },
            { label: "Duration",   value: formatDuration(record.durationSeconds) || "—" },
            { label: "AI Model",   value: record.model },
            { label: "Provider",   value: record.provider },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[9px] font-black uppercase tracking-widest mb-1 text-white/30 font-sans">{label}</p>
              <p className="text-[13px] font-bold text-white/85 truncate leading-tight">{value}</p>
            </div>
          ))}
        </div>

        {/* Features Used */}
        {record.featuresUsed && record.featuresUsed.length > 0 && (
          <div className="pt-3 border-t border-white/[0.04] mt-1">
            <p className="text-[9px] font-black uppercase tracking-widest mb-2 text-white/30 font-sans">Features Used</p>
            <div className="flex flex-wrap gap-2">
              {record.featuresUsed.map(f => (
                <span key={f} className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                  style={{ background: BASE, color: FEATURE_LABELS[f]?.color, border: `1px solid ${FEATURE_LABELS[f]?.color}30`, boxShadow: nm(false) }}>
                  {FEATURE_LABELS[f]?.icon} {FEATURE_LABELS[f]?.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Q&A History */}
      {record.qaHistory && record.qaHistory.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-black uppercase tracking-widest text-white/40 font-sans">
              Q&amp;A History
            </p>
            <span className="text-[11px] font-bold text-white/30 font-sans">{record.qaHistory.length} exchange{record.qaHistory.length !== 1 ? "s" : ""}</span>
          </div>
          {record.qaHistory.map((qa, i) => {
            const isOpen = expandedQA === i;
            const feat = FEATURE_LABELS[qa.feature] || FEATURE_LABELS["follow-up"];
            return (
              <motion.div key={i} layout className="rounded-[16px] overflow-hidden transition-all"
                style={{ 
                  background: BASE,
                  boxShadow: isOpen ? nm(true) : nm(false),
                  border: isOpen ? `1px solid ${feat.color}20` : "none"
                }}>
                {/* Q header */}
                <button className="w-full flex items-start gap-4 p-4 text-left outline-none" onClick={() => setExpandedQA(isOpen ? null : i)}>
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[14px] shrink-0 mt-0.5"
                    style={{ background: BASE, boxShadow: nm(true), border: `1px solid ${feat.color}25` }}>
                    {feat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[9px] font-black uppercase tracking-widest font-sans" style={{ color: feat.color }}>{feat.label}</span>
                      <span className="text-[9px] font-bold text-white/30 font-sans">{formatTime(qa.timestamp)}</span>
                    </div>
                    <p className="text-[13px] text-white/80 font-bold leading-snug line-clamp-2">{qa.question}</p>
                  </div>
                  <div className="shrink-0 mt-1.5 w-6 h-6 flex items-center justify-center rounded-full text-white/30 transition-transform" 
                    style={{ transform: isOpen ? "rotate(180deg)" : "none", color: isOpen ? feat.color : "rgba(255,255,255,0.3)", background: BASE, boxShadow: nm(true) }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </button>

                {/* Expanded Answer */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div key="answer" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: "easeInOut" }}>
                      <div className="px-4 pb-4 flex flex-col gap-3">
                        {/* Full Question */}
                        <div className="rounded-[12px] p-4 border-l-[3px] border-l-[#facc15]" style={{ background: BASE, boxShadow: nm(false) }}>
                          <p className="text-[9px] font-black uppercase tracking-widest mb-2 text-white/30 font-sans">🎙️ Full Question</p>
                          <p className="text-[13px] text-white/80 leading-relaxed font-semibold">{qa.question}</p>
                        </div>
                        {/* Answer */}
                        <div className="rounded-[12px] p-4 relative overflow-hidden border-l-[3px] border-l-[#c8894a]" style={{ background: BASE, boxShadow: nm(false) }}>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#c8894a] font-sans">🤖 Ghostly AI Answer</p>
                            <button onClick={() => copyText(qa.answer, i)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all outline-none"
                              style={{
                                background: BASE,
                                boxShadow: copiedIdx === i ? nm(false) : nm(true),
                                color: copiedIdx === i ? "#22c55e" : "rgba(255,255,255,0.5)",
                              }}>
                              {copiedIdx === i ? "✓ Copied!" : "Copy Answer"}
                            </button>
                          </div>
                          <p className="text-[13px] text-white/75 font-medium leading-relaxed whitespace-pre-wrap font-sans" style={{ maxHeight: "280px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>{qa.answer}</p>
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
        <div className="flex flex-col items-center gap-3 py-12 text-center rounded-[16px]" style={{ background: BASE, boxShadow: nm(false) }}>
          <span className="text-4xl">📝</span>
          <p className="text-[13px] font-bold text-white/35 font-sans">No Q&amp;A pairs recorded for this session.</p>
        </div>
      )}

      {/* Delete button */}
      <div className="pt-4 border-t border-white/[0.04] mt-2">
        {confirmDelete ? (
          <div className="flex items-center gap-3 justify-center">
            <span className="text-[12px] font-bold text-white/40 font-sans">Delete session forever?</span>
            <button onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="px-4 py-2 rounded-xl text-[11px] font-bold shadow-sm"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
              Yes, Delete
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-xl text-[11px] font-bold shadow-sm"
              style={{ background: BASE, color: "rgba(255,255,255,0.5)", boxShadow: nm() }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            className="w-full py-2.5 rounded-[12px] text-[12px] font-bold transition-all flex items-center justify-center gap-2 outline-none"
            style={{ background: BASE, color: "#f87171", boxShadow: nm() }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); }}>
            🗑 Delete This Session
          </button>
        )}
      </div>
    </div>
  );
};
