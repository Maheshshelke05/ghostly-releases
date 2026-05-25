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

const FEATURE_LABELS: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  "ai-answer": { icon: "🎙️", label: "AI Answer",    color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  "screen":    { icon: "🖥️", label: "Screen AI",    color: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe" },
  "chat":      { icon: "💬", label: "AI Chat",       color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  "follow-up": { icon: "🔄", label: "Follow-up",     color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
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
            style={{ background: "rgba(15,23,42,0.6)", backdropFilter: "blur(8px)" }}
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
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ pointerEvents: "none" }}
          >
            <div
              className="w-full flex flex-col rounded-[24px] overflow-hidden"
              style={{
                maxWidth: selected ? "800px" : "480px",
                maxHeight: "85vh",
                pointerEvents: "auto",
                background: "#ffffff",
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 24px 48px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.02)",
                transition: "max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={() => window.ghostly.enableMouse()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b bg-white relative z-10" style={{ borderColor: "#f1f5f9", flexShrink: 0 }}>
                <div className="flex items-center gap-4">
                  {selected && (
                    <button
                      onClick={() => { setSelected(null); setExpandedQA(null); }}
                      className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                      style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#0f172a"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.color = "#64748b"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                    </button>
                  )}
                  <div>
                    <h2 className="text-[17px] font-black text-slate-900 leading-tight">
                      {selected ? (selected.companyName || "Interview Session") : "📋 Last Interviews"}
                    </h2>
                    <p className="text-[11px] font-bold mt-1" style={{ color: "#64748b" }}>
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
                        <span className="text-[11px] font-bold text-slate-500">Sure?</span>
                        <button onClick={handleClearAll}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shadow-sm"
                          style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fca5a5" }}>
                          Yes, Clear
                        </button>
                        <button onClick={() => setConfirmClear(false)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                          style={{ background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmClear(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                        style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fee2e2" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2"; e.currentTarget.style.borderColor = "#fca5a5"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fee2e2"; }}>
                        🗑 Clear All
                      </button>
                    )
                  )}
                  <button onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                    style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fca5a5"; e.currentTarget.style.color = "#ef4444"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/50" style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}>
                {loading ? (
                  <div className="flex items-center justify-center py-20 gap-3">
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eb9245" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    <span className="text-[13px] font-bold text-slate-500">Loading history…</span>
                  </div>
                ) : records.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
                    <div className="text-6xl drop-shadow-sm">📭</div>
                    <p className="text-[16px] font-black text-slate-800">No interviews yet</p>
                    <p className="text-[13px] font-medium text-slate-500 max-w-xs leading-relaxed">
                      Complete an interview session and your full history with all Q&amp;A will appear here.
                    </p>
                  </div>
                ) : selected ? (
                  /* ── Detail View ── */
                  <DetailView
                    record={selected}
                    expandedQA={expandedQA}
                    setExpandedQA={setExpandedQA}
                    onDelete={() => handleDeleteOne(selected.id)}
                  />
                ) : (
                  /* ── List View ── */
                  <div className="p-4 flex flex-col gap-3">
                    {records.map((rec, idx) => (
                      <motion.button
                        key={rec.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04, duration: 0.2 }}
                        onClick={() => { setSelected(rec); setExpandedQA(null); }}
                        className="w-full text-left rounded-[16px] p-4 transition-all group relative overflow-hidden bg-white"
                        style={{ border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = "#cbd5e1";
                          e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.06)";
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = "#e2e8f0";
                          e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.02)";
                          e.currentTarget.style.transform = "translateY(0)";
                        }}
                      >
                        <div className="flex items-start justify-between gap-4 relative z-10">
                          {/* Left */}
                          <div className="flex items-start gap-4 min-w-0">
                            <div className="w-12 h-12 rounded-[12px] flex items-center justify-center text-[22px] shrink-0"
                              style={{ background: "#f8fafc", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px inset rgba(0,0,0,0.02)" }}>
                              🏢
                            </div>
                            <div className="min-w-0">
                              <p className="text-[14px] font-black text-slate-900 truncate leading-tight">
                                {rec.companyName || "Interview Session"}
                              </p>
                              {rec.position && (
                                <p className="text-[12px] font-bold text-slate-500 truncate mt-1">{rec.position}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-md"
                                  style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" }}>
                                  {TYPE_LABELS[rec.interviewType] || rec.interviewType}
                                </span>
                                {rec.featuresUsed?.map(f => (
                                  <span key={f} className="text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"
                                    style={{ background: FEATURE_LABELS[f]?.bg, color: FEATURE_LABELS[f]?.color, border: `1px solid ${FEATURE_LABELS[f]?.border}` }}>
                                    {FEATURE_LABELS[f]?.icon} {FEATURE_LABELS[f]?.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Right */}
                          <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                            <span className="text-[12px] font-black text-slate-800">{formatDate(rec.timestamp)}</span>
                            <span className="text-[10px] font-bold text-slate-500">{formatTime(rec.timestamp)}</span>
                            {formatDuration(rec.durationSeconds) && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md mt-1"
                                style={{ background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
                                ⏱ {formatDuration(rec.durationSeconds)}
                              </span>
                            )}
                            {rec.qaHistory && rec.qaHistory.length > 0 && (
                              <span className="text-[10px] font-bold text-slate-400 mt-0.5">{rec.qaHistory.length} Q&amp;A</span>
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

/* ── Detail View ── */
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
    <div className="p-5 flex flex-col gap-6 bg-white">
      {/* Session Info Card */}
      <div className="rounded-[16px] p-5 flex flex-col gap-4 shadow-sm"
        style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
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
              <p className="text-[9px] font-black uppercase tracking-widest mb-1 text-slate-400">{label}</p>
              <p className="text-[13px] font-black text-slate-800 truncate">{value}</p>
            </div>
          ))}
        </div>

        {/* Features Used */}
        {record.featuresUsed && record.featuresUsed.length > 0 && (
          <div className="pt-2 border-t border-slate-200 mt-1">
            <p className="text-[9px] font-black uppercase tracking-widest mb-2 text-slate-400">Features Used</p>
            <div className="flex flex-wrap gap-2">
              {record.featuresUsed.map(f => (
                <span key={f} className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-lg"
                  style={{ background: FEATURE_LABELS[f]?.bg, color: FEATURE_LABELS[f]?.color, border: `1px solid ${FEATURE_LABELS[f]?.border}` }}>
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
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Q&amp;A History
            </p>
            <span className="text-[11px] font-bold text-slate-400">{record.qaHistory.length} exchange{record.qaHistory.length !== 1 ? "s" : ""}</span>
          </div>
          {record.qaHistory.map((qa, i) => {
            const isOpen = expandedQA === i;
            const feat = FEATURE_LABELS[qa.feature] || FEATURE_LABELS["follow-up"];
            return (
              <motion.div key={i} layout className="rounded-[16px] overflow-hidden transition-all"
                style={{ 
                  border: `1px solid ${isOpen ? feat.border : "#e2e8f0"}`, 
                  background: isOpen ? "#ffffff" : "#f8fafc",
                  boxShadow: isOpen ? "0 8px 24px rgba(0,0,0,0.04)" : "none"
                }}>
                {/* Q header — always visible */}
                <button className="w-full flex items-start gap-4 p-4 text-left hover:bg-slate-50/50 transition-colors" onClick={() => setExpandedQA(isOpen ? null : i)}>
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[14px] shrink-0 mt-0.5 shadow-sm"
                    style={{ background: feat.bg, border: `1px solid ${feat.border}` }}>
                    {feat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: feat.color }}>{feat.label}</span>
                      <span className="text-[9px] font-bold text-slate-400">{formatTime(qa.timestamp)}</span>
                    </div>
                    <p className="text-[13px] text-slate-700 font-bold leading-snug line-clamp-2">{qa.question}</p>
                  </div>
                  <div className="shrink-0 mt-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-transform" 
                    style={{ transform: isOpen ? "rotate(180deg)" : "none", color: isOpen ? feat.color : "#94a3b8", background: isOpen ? feat.bg : "#f1f5f9" }}>
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
                        <div className="rounded-[12px] p-4 shadow-sm" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                          <p className="text-[9px] font-black uppercase tracking-widest mb-2 text-slate-500">🎙️ Full Question</p>
                          <p className="text-[13px] text-slate-800 leading-relaxed font-semibold">{qa.question}</p>
                        </div>
                        {/* Answer */}
                        <div className="rounded-[12px] p-4 shadow-sm relative overflow-hidden" style={{ background: "#ffffff", border: "1px solid #fed7aa" }}>
                          {/* Subtle background glow */}
                          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-300 to-amber-200 opacity-50" />
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">🤖 Ghostly AI Answer</p>
                            <button onClick={() => copyText(qa.answer, i)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm"
                              style={copiedIdx === i
                                ? { background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }
                                : { background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
                              {copiedIdx === i ? "✓ Copied!" : "Copy Answer"}
                            </button>
                          </div>
                          <p className="text-[13px] text-slate-800 font-medium leading-relaxed whitespace-pre-wrap" style={{ maxHeight: "280px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}>{qa.answer}</p>
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
        <div className="flex flex-col items-center gap-3 py-12 text-center bg-slate-50 rounded-[16px] border border-slate-100">
          <span className="text-4xl">📝</span>
          <p className="text-[13px] font-bold text-slate-500">No Q&amp;A pairs recorded for this session.</p>
        </div>
      )}

      {/* Delete button */}
      <div className="pt-4 border-t border-slate-100 mt-2">
        {confirmDelete ? (
          <div className="flex items-center gap-3 justify-center">
            <span className="text-[12px] font-bold text-slate-500">Delete this session forever?</span>
            <button onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="px-4 py-2 rounded-xl text-[11px] font-bold shadow-sm"
              style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fca5a5" }}>
              Yes, Delete
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-xl text-[11px] font-bold shadow-sm"
              style={{ background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            className="w-full py-2.5 rounded-[12px] text-[12px] font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
            style={{ background: "#ffffff", color: "#ef4444", border: "1px solid #fee2e2" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fca5a5"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.borderColor = "#fee2e2"; }}>
            🗑 Delete This Session
          </button>
        )}
      </div>
    </div>
  );
};
