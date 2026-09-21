import React, { useState, useEffect, useMemo, useRef } from "react";
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
  language?: string;
  companyName?: string;
  position?: string;
  durationSeconds?: number;
  featuresUsed?: ("ai-answer" | "screen" | "chat")[];
  qaHistory?: QAPair[];
}

/* ─── Design system ─── */
const INK = "#15162b";
const MUTED = "#6b7280";
const SUBTLE = "#9ca3af";
const BORDER = "#e8e8ee";
const SURFACE = "#f7f7fa";
const ACCENT = "#6d6fb0";

const GLASS: React.CSSProperties = {
  background: "#ffffff",
  border: `1px solid ${BORDER}`,
  boxShadow: "0 32px 80px rgba(20,20,40,0.28), 0 2px 8px rgba(20,20,40,0.08)",
};

type Tone = { label: string; color: string; bg: string; border: string };

const FEATURE_LABELS: Record<string, Tone & { icon: string }> = {
  "ai-answer": { icon: "🎙️", label: "AI Answer", color: "#6d6fb0", bg: "#f0f0fb", border: "#c7c9f0" },
  "screen":    { icon: "🖥️", label: "Screen AI",  color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  "chat":      { icon: "💬", label: "AI Chat",    color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  "follow-up": { icon: "🔄", label: "Follow-up",  color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
};

const TYPE_STYLES: Record<string, Tone> = {
  "general":       { label: "Screen Analysis", color: "#6d6fb0", bg: "#f0f0fb", border: "#c7c9f0" },
  // Older saved sessions may still carry one of these from before the
  // Code Language / Interview Type setting was removed — kept for display.
  "dsa":           { label: "DSA",           color: "#6d6fb0", bg: "#f0f0fb", border: "#c7c9f0" },
  "system_design": { label: "System Design", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  "frontend":      { label: "Frontend",      color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  "sql":           { label: "SQL",           color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  "behavioral":    { label: "Behavioral",    color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  "live-interview":{ label: "Live Interview",color: "#db2777", bg: "#fdf2f8", border: "#fbcfe8" },
};

function typeStyle(type: string): Tone {
  return TYPE_STYLES[type] || { label: type, color: "#6d6fb0", bg: "#f0f0fb", border: "#c7c9f0" };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function formatDuration(secs?: number) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* Sessions are already newest-first, so grouping keeps that order. */
function dayLabel(ts: number) {
  const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.getTime(); };
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return formatDate(ts);
}

function groupByDay(records: InterviewRecord[]) {
  const groups: { label: string; items: InterviewRecord[] }[] = [];
  for (const rec of records) {
    const label = dayLabel(rec.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(rec);
    else groups.push({ label, items: [rec] });
  }
  return groups;
}

/* ─── Small building blocks ─── */
function CompanyAvatar({ name, tone }: { name?: string; tone: Tone }) {
  const initials = name ? name.trim().slice(0, 2).toUpperCase() : "IN";
  return (
    <div
      className="w-10 h-10 rounded-[13px] flex items-center justify-center text-[13px] font-black shrink-0"
      style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color }}
    >
      {initials}
    </div>
  );
}

function StatTile({ icon, label, value, valueColor }: { icon: string; label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div className="rounded-[14px] px-3 py-2.5 flex flex-col gap-0.5 min-w-0" style={{ background: "#ffffff", border: `1px solid ${BORDER}` }}>
      <span className="text-[8.5px] font-black uppercase tracking-[0.12em] flex items-center gap-1" style={{ color: SUBTLE }}>
        <span>{icon}</span> {label}
      </span>
      <span className="text-[14px] font-extrabold leading-tight truncate" style={{ color: valueColor || INK }}>{value}</span>
    </div>
  );
}

interface Props { open: boolean; onClose: () => void; }

export const InterviewHistoryModal: React.FC<Props> = ({ open, onClose }) => {
  const [records, setRecords]       = useState<InterviewRecord[]>([]);
  const [selected, setSelected]     = useState<InterviewRecord | null>(null);
  const [expandedQA, setExpandedQA] = useState<number | null>(null);
  const [loading, setLoading]       = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [query, setQuery]           = useState("");

  const bodyRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(null);
    setExpandedQA(null);
    setQuery("");
    setConfirmClear(false);
    listScrollTop.current = 0;
    try {
      window.ghostly.getHistory().then((h: InterviewRecord[]) => {
        setRecords(Array.isArray(h) ? h.sort((a, b) => b.timestamp - a.timestamp) : []);
        setLoading(false);
      }).catch(() => setLoading(false));
    } catch { setLoading(false); }
  }, [open]);

  // Opening a session should start at its top; going back should land where
  // the list was scrolled to instead of jumping to the first row.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = selected ? 0 : listScrollTop.current;
  }, [selected]);

  const openRecord = (rec: InterviewRecord) => {
    listScrollTop.current = bodyRef.current?.scrollTop || 0;
    setSelected(rec);
    setExpandedQA(rec.qaHistory && rec.qaHistory.length > 0 ? 0 : null);
  };
  const closeRecord = () => { setSelected(null); setExpandedQA(null); };

  // Escape steps back: clears an active search, then leaves a session, then
  // closes the modal. (There's no dimmed backdrop to click any more, so this
  // is the keyboard equivalent of clicking outside.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) closeRecord();
      else if (query) setQuery("");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, query, onClose]);

  const handleClearAll = async () => {
    await window.ghostly.saveHistory([]).catch(() => {});
    setRecords([]); setSelected(null); setConfirmClear(false); setQuery("");
  };

  const handleDeleteOne = async (id: string) => {
    const next = records.filter(r => r.id !== id);
    await window.ghostly.saveHistory(next).catch(() => {});
    setRecords(next);
    if (selected?.id === id) closeRecord();
  };

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return records;
    return records.filter(r =>
      [r.companyName, r.position, typeStyle(r.interviewType).label, r.model, r.provider, ...(r.qaHistory || []).map(x => x.question)]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [records, q]);
  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const totals = useMemo(() => ({
    seconds: records.reduce((n, r) => n + (r.durationSeconds || 0), 0),
    qa: records.reduce((n, r) => n + (r.qaHistory?.length || 0), 0),
  }), [records]);

  let cardIndex = 0;

  return (
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
            role="dialog"
            aria-label="Interview history"
            className="w-full flex flex-col rounded-[26px] overflow-hidden relative"
            style={{
              ...GLASS,
              maxWidth: selected ? "740px" : "450px",
              maxHeight: "84vh",
              pointerEvents: "auto",
              transition: "max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onMouseEnter={() => window.ghostly.enableMouse()}
            onMouseLeave={() => window.ghostly.disableMouse()}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-3 min-w-0">
                {selected && (
                  <button
                    onClick={closeRecord}
                    aria-label="Back to all sessions"
                    title="Back (Esc)"
                    className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0 transition-all hover:bg-white"
                    style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: MUTED }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                  </button>
                )}
                <div className="min-w-0">
                  <h2 className="text-[16px] font-bold leading-tight truncate" style={{ color: INK }}>
                    {selected ? (selected.companyName || "Interview Session") : "Last Interviews"}
                  </h2>
                  <p className="text-[10.5px] font-semibold mt-0.5 truncate" style={{ color: SUBTLE }}>
                    {selected
                      ? `${formatDate(selected.timestamp)} · ${formatTime(selected.timestamp)}`
                      : loading
                        ? "Loading…"
                        : `${records.length} session${records.length !== 1 ? "s" : ""} saved`}
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                aria-label="Close history"
                title="Close (Esc)"
                className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0 transition-all hover:bg-white"
                style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: MUTED }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* ── List toolbar: stats + search + clear ── */}
            {!selected && !loading && records.length > 0 && (
              <div className="px-4 pt-3 pb-2 shrink-0 flex flex-col gap-2.5">
                <div
                  className="flex items-center justify-between rounded-xl px-3.5 h-9 text-[11px] font-semibold"
                  style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: MUTED }}
                >
                  <span>🗂️ <b style={{ color: INK }}>{records.length}</b> session{records.length !== 1 ? "s" : ""}</span>
                  <span className="w-px h-3.5" style={{ background: BORDER }} />
                  <span>⏱ <b style={{ color: INK }}>{formatDuration(totals.seconds) || "—"}</b> total</span>
                  <span className="w-px h-3.5" style={{ background: BORDER }} />
                  <span>💬 <b style={{ color: INK }}>{totals.qa}</b> Q&amp;A</span>
                </div>

                {confirmClear ? (
                  <div
                    className="flex items-center justify-between gap-2 rounded-xl px-3 h-9"
                    style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
                  >
                    <span className="text-[11px] font-bold truncate" style={{ color: "#b91c1c" }}>
                      Delete all {records.length} sessions?
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={handleClearAll}
                        className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all"
                        style={{ background: "#dc2626", color: "#ffffff" }}
                      >Yes, delete all</button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all"
                        style={{ background: "#ffffff", color: MUTED, border: `1px solid ${BORDER}` }}
                      >Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="relative flex-1 flex items-center">
                      <svg className="absolute left-3 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={SUBTLE} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                      <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search company, role or question…"
                        className="w-full h-9 pl-9 pr-8 rounded-xl text-[12px] font-medium outline-none transition-all focus:bg-white focus:border-[#c7c9f0] focus:shadow-[0_0_0_3px_rgba(109,111,176,0.12)]"
                        style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: INK }}
                      />
                      {query && (
                        <button
                          onClick={() => setQuery("")}
                          aria-label="Clear search"
                          className="absolute right-2 w-5 h-5 rounded-full flex items-center justify-center hover:bg-white"
                          style={{ color: SUBTLE }}
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </label>
                    <button
                      onClick={() => setConfirmClear(true)}
                      aria-label="Clear all history"
                      title="Clear all history"
                      className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0 transition-all hover:brightness-95"
                      style={{ background: "#fef2f2", border: "1px solid #fecaca", fontSize: "13px" }}
                    >🗑</button>
                  </div>
                )}
              </div>
            )}

            {/* ── Body ── */}
            <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-8 h-8 rounded-full animate-spin" style={{ border: `2px solid ${BORDER}`, borderTopColor: INK }} />
                  <span className="text-[12px] font-semibold" style={{ color: SUBTLE }}>Loading history…</span>
                </div>
              ) : records.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
                  <div
                    className="w-16 h-16 rounded-[20px] flex items-center justify-center text-4xl"
                    style={{ background: "#f0f0fb", border: "1px solid #c7c9f0" }}
                  >📭</div>
                  <div>
                    <p className="text-[15px] font-bold" style={{ color: INK }}>No interviews yet</p>
                    <p className="text-[12px] font-medium mt-1 max-w-xs leading-relaxed" style={{ color: SUBTLE }}>
                      Complete an interview session and your history will appear here.
                    </p>
                  </div>
                </div>
              ) : selected ? (
                <motion.div key={`detail-${selected.id}`} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
                  <DetailView
                    record={selected}
                    expandedQA={expandedQA}
                    setExpandedQA={setExpandedQA}
                    onDelete={() => handleDeleteOne(selected.id)}
                  />
                </motion.div>
              ) : (
                <motion.div key="list" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="px-3 pb-3 pt-1 flex flex-col gap-3">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center gap-2.5 py-14 text-center px-6">
                      <span className="text-3xl">🔎</span>
                      <p className="text-[13px] font-bold" style={{ color: INK }}>No sessions match “{query.trim()}”</p>
                      <button
                        onClick={() => setQuery("")}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all hover:bg-white"
                        style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: MUTED }}
                      >Clear search</button>
                    </div>
                  ) : (
                    groups.map(group => (
                      <div key={group.label}>
                        <p className="px-1 pb-1.5 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: SUBTLE }}>
                          {group.label}
                        </p>
                        <div className="flex flex-col gap-2">
                          {group.items.map(rec => (
                            <SessionCard key={rec.id} rec={rec} index={cardIndex++} onOpen={() => openRecord(rec)} />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ─── Session card (list row) ─── */
const SessionCard: React.FC<{ rec: InterviewRecord; index: number; onOpen: () => void }> = ({ rec, index, onOpen }) => {
  const tone = typeStyle(rec.interviewType);
  const dur = formatDuration(rec.durationSeconds);
  const qaCount = rec.qaHistory?.length || 0;

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.035, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      whileTap={{ scale: 0.99 }}
      onClick={onOpen}
      className="w-full text-left rounded-[16px] px-3.5 py-3 outline-none group flex items-center gap-3 border border-[#e8e8ee] bg-[#f7f7fa] transition-all hover:bg-white hover:border-[#c7c9f0] hover:shadow-[0_6px_18px_rgba(109,111,176,0.14)] focus-visible:border-[#c7c9f0]"
    >
      <CompanyAvatar name={rec.companyName} tone={tone} />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-bold leading-tight truncate" style={{ color: INK }}>
            {rec.companyName || "Interview Session"}
          </p>
          <span className="text-[10px] font-semibold shrink-0" style={{ color: SUBTLE }}>{formatTime(rec.timestamp)}</span>
        </div>
        {rec.position && (
          <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: MUTED }}>{rec.position}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[9.5px] font-black px-2 py-0.5 rounded-full"
            style={{ background: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}
          >{tone.label}</span>
          {rec.featuresUsed?.map(f => {
            const fl = FEATURE_LABELS[f];
            if (!fl) return null;
            return (
              <span
                key={f}
                title={fl.label}
                className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px]"
                style={{ background: fl.bg, border: `1px solid ${fl.border}` }}
              >{fl.icon}</span>
            );
          })}
          {dur && <span className="text-[10px] font-semibold" style={{ color: MUTED }}>⏱ {dur}</span>}
          {qaCount > 0 && <span className="text-[10px] font-semibold" style={{ color: ACCENT }}>💬 {qaCount}</span>}
        </div>
      </div>

      <svg
        className="shrink-0 opacity-30 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
        style={{ color: ACCENT }}
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      ><path d="M9 6l6 6-6 6"/></svg>
    </motion.button>
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
  const tone = typeStyle(record.interviewType);
  const qaCount = record.qaHistory?.length || 0;

  const copyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {}
  };

  // The date/time already sits under the title in the header, and each
  // exchange below is tagged with its own feature, so the summary keeps only
  // what isn't shown anywhere else.
  const facts = [
    { label: "Position", value: record.position || "—", icon: "💼" },
    { label: "AI Model", value: [record.provider, record.model].filter(Boolean).join(" · ") || "—", icon: "🤖" },
  ];

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* ── Session summary ── */}
      <div className="rounded-[20px] p-3.5 flex flex-col gap-3.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-3 gap-2">
          <StatTile icon="⏱" label="Duration" value={formatDuration(record.durationSeconds) || "—"} />
          <StatTile icon="💬" label="Exchanges" value={qaCount} />
          <StatTile icon="📂" label="Type" value={tone.label} valueColor={tone.color} />
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          {facts.map(({ label, value, icon }) => (
            <div key={label} className="min-w-0">
              <p className="text-[8.5px] font-black uppercase tracking-[0.12em] mb-1 flex items-center gap-1" style={{ color: SUBTLE }}>
                <span>{icon}</span> {label}
              </p>
              <p className="text-[12.5px] font-bold truncate leading-tight" style={{ color: INK }} title={value}>{value}</p>
            </div>
          ))}
        </div>

      </div>

      {/* ── Q&A History ── */}
      {record.qaHistory && record.qaHistory.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: MUTED }}>
              Q&A History
            </p>
            <button
              onClick={() => setExpandedQA(expandedQA === null ? 0 : null)}
              className="text-[10px] font-bold px-2.5 py-1 rounded-full transition-all hover:bg-white"
              style={{ background: "#f0f0fb", border: "1px solid #c7c9f0", color: "#5b5da8" }}
            >
              {expandedQA === null ? "Open first" : "Collapse"}
            </button>
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
                  background: isOpen ? "#ffffff" : SURFACE,
                  border: isOpen ? `1px solid ${feat.border}` : `1px solid ${BORDER}`,
                  boxShadow: isOpen ? "0 6px 18px rgba(109,111,176,0.10)" : "none",
                }}
              >
                {/* Question header */}
                <button
                  className="w-full flex items-start gap-3 p-3.5 text-left outline-none"
                  aria-expanded={isOpen}
                  onClick={() => setExpandedQA(isOpen ? null : i)}
                >
                  <div
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[14px] shrink-0 mt-0.5"
                    style={{ background: feat.bg, border: `1px solid ${feat.border}` }}
                  >
                    {feat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: feat.color }}>Q{i + 1} · {feat.label}</span>
                      <span className="text-[9px] font-semibold" style={{ color: SUBTLE }}>{formatTime(qa.timestamp)}</span>
                    </div>
                    <p className="text-[12.5px] font-semibold leading-snug line-clamp-2" style={{ color: "#374151" }}>{qa.question}</p>
                  </div>
                  <div
                    className="shrink-0 mt-1.5 w-6 h-6 flex items-center justify-center rounded-full transition-all"
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "none",
                      background: isOpen ? feat.bg : "#ffffff",
                      border: isOpen ? `1px solid ${feat.border}` : `1px solid ${BORDER}`,
                      color: isOpen ? feat.color : SUBTLE,
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
                      <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
                        {/* Full question */}
                        <div
                          className="rounded-[13px] p-3.5"
                          style={{
                            background: "#fffbeb",
                            border: "1px solid #fde68a",
                            borderLeft: "3px solid #f59e0b",
                          }}
                        >
                          <p className="text-[8.5px] font-black uppercase tracking-widest mb-2" style={{ color: "#b45309" }}>🎙️ Full Question</p>
                          <p className="text-[12.5px] leading-relaxed font-medium" style={{ color: "#374151" }}>{qa.question}</p>
                        </div>

                        {/* AI Answer */}
                        <div
                          className="rounded-[13px] p-3.5 relative"
                          style={{
                            background: "#f0f0fb",
                            border: "1px solid #c7c9f0",
                            borderLeft: "3px solid #6d6fb0",
                          }}
                        >
                          <div className="flex items-center justify-between mb-2.5">
                            <p className="text-[8.5px] font-black uppercase tracking-widest" style={{ color: "#5b5da8" }}>🤖 Ghostly AI Answer</p>
                            <button
                              onClick={() => copyText(qa.answer, i)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9.5px] font-bold transition-all"
                              style={{
                                background: copiedIdx === i ? "#f0fdf4" : "#ffffff",
                                border: copiedIdx === i ? "1px solid #bbf7d0" : `1px solid ${BORDER}`,
                                color: copiedIdx === i ? "#16a34a" : MUTED,
                              }}
                            >
                              {copiedIdx === i ? "✓ Copied!" : "Copy"}
                            </button>
                          </div>
                          <p
                            className="text-[12.5px] font-medium leading-relaxed whitespace-pre-wrap"
                            style={{
                              color: "#374151",
                              maxHeight: "260px",
                              overflowY: "auto",
                              scrollbarWidth: "thin",
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
          style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
        >
          <span className="text-3xl">📝</span>
          <p className="text-[12px] font-semibold" style={{ color: SUBTLE }}>No Q&A pairs recorded for this session.</p>
        </div>
      )}

      {/* ── Delete ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "14px" }}>
        {confirmDelete ? (
          <div className="flex items-center gap-3 justify-center">
            <span className="text-[12px] font-semibold" style={{ color: MUTED }}>Delete session forever?</span>
            <button
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="px-4 py-2 rounded-xl text-[11px] font-bold transition-all"
              style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
            >Yes, Delete</button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-xl text-[11px] font-bold transition-all"
              style={{ background: SURFACE, color: MUTED, border: `1px solid ${BORDER}` }}
            >Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-2 rounded-[13px] text-[11.5px] font-bold transition-all flex items-center justify-center gap-2 hover:bg-[#fef2f2]"
            style={{ color: "#dc2626", border: "1px solid #fecaca", background: "#ffffff" }}
          >
            🗑 Delete This Session
          </button>
        )}
      </div>
    </div>
  );
};
