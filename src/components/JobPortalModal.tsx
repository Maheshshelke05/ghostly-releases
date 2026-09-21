import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const JOB_PORTAL_URL = "https://job.ghotlyai.in/";
const BOT_URL = "https://t.me/GhostlyAIJobBot";
const CHANNEL_URL = "https://t.me/GhostlyAIJobs";

const INK = "#15162b";
const MUTED = "#6b7280";
const SUBTLE = "#9ca3af";
const BORDER = "#e8e8ee";
const SURFACE = "#f7f7fa";
const LIME = "#a3e635";

const openExternal = (url: string) => window.ghostly.openExternal(url);

const PREVIEW_ALERTS = [
  { icon: "🏛", title: "Talathi Bharti 2026 — Solapur", meta: "12th pass · 312 posts" },
  { icon: "🏢", title: "Data Entry Operator — Pune", meta: "Tally + Excel · ₹14–18k" },
  { icon: "🎓", title: "Software Intern — Hinjawadi", meta: "BE / BCA freshers" },
];

// Small animated preview of what the Job Portal delivers; shared with the sponsor popup.
export const JobPortalPreview: React.FC = () => (
  <div
    className="relative shrink-0 rounded-[14px] overflow-hidden px-3 pt-2.5 pb-3"
    style={{ background: "linear-gradient(135deg, #f6fbe4 0%, #eef8cf 100%)", border: "1px solid #dcebb0" }}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: "#4d6b12" }}>
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: "#65a30d" }} />
          <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: "#65a30d" }} />
        </span>
        Live · every 2 min
      </span>
      <span className="text-[8px] font-bold" style={{ color: "#6b7f3a" }}>job.ghotlyai.in</span>
    </div>
    <div className="flex flex-col gap-1.5">
      {PREVIEW_ALERTS.map((a, i) => (
        <motion.div
          key={a.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25 + i * 0.12, ease: "easeOut" }}
          className="flex items-center gap-2 rounded-[10px] px-2 py-1.5"
          style={{ background: "#ffffff", boxShadow: "0 1px 0 rgba(20,20,40,0.04), 0 2px 8px rgba(77,107,18,0.08)" }}
        >
          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[12px] shrink-0" style={{ background: "#f0f7d8" }}>{a.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold leading-tight truncate" style={{ color: INK }}>{a.title}</span>
            <span className="block text-[8.5px] font-medium truncate" style={{ color: MUTED }}>{a.meta}</span>
          </span>
          {i === 0 && (
            <span className="text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0" style={{ background: LIME, color: INK }}>New</span>
          )}
        </motion.div>
      ))}
    </div>
  </div>
);

export const BriefcaseIcon: React.FC<{ size?: number; color?: string }> = ({ size = 13, color = INK }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <path d="M2 13h20" />
  </svg>
);

const ExternalIcon = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

const TelegramIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21.9 4.3 18.7 19.5c-.24 1.07-.87 1.33-1.76.83l-4.87-3.59-2.35 2.26c-.26.26-.48.48-.98.48l.35-4.96 9.03-8.16c.39-.35-.09-.54-.61-.19L6.35 13.2l-4.8-1.5c-1.04-.33-1.06-1.04.22-1.54L20.5 3.03c.87-.32 1.63.2 1.4 1.27Z" />
  </svg>
);

const STEPS = [
  { title: "Open the bot or app", body: "Pick your language, share your number." },
  { title: "Send your resume", body: "PDF, Word or a photo — AI builds your profile." },
  { title: "Pay ₹10, get alerts", body: "Matching jobs arrive within 2 minutes of posting." },
];

const FACTS = [
  "Official apply links only — no consultancy numbers",
  "₹10 for 3 days, ₹99 for 30 days — no auto-debit",
  "English, मराठी and हिंदी supported",
  "An alert service — not a recruiter, no job guarantee",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export const JobPortalModal: React.FC<Props> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="job-portal"
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 24 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ pointerEvents: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
        >
          <div
            role="dialog"
            aria-label="GhostlyAI Job Portal"
            className="w-full max-w-[430px] flex flex-col rounded-[26px] overflow-hidden"
            style={{
              maxHeight: "88vh",
              pointerEvents: "auto",
              background: "#ffffff",
              border: `1px solid ${BORDER}`,
              boxShadow: "0 32px 80px rgba(20,20,40,0.28), 0 2px 8px rgba(20,20,40,0.08)",
            }}
            onMouseEnter={() => window.ghostly.enableMouse()}
            onMouseLeave={() => window.ghostly.disableMouse()}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#f0f7d8", border: "1px solid #dcebb0" }}>
                  <BriefcaseIcon size={16} color="#4d6b12" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold leading-tight truncate" style={{ color: INK }}>GhostlyAI Job Portal</h2>
                  <p className="text-[10.5px] font-semibold mt-0.5 truncate" style={{ color: SUBTLE }}>Our job alert service · job.ghotlyai.in</p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                title="Close (Esc)"
                className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0 transition-all hover:bg-white"
                style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: MUTED }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <div>
                <p className="text-[19px] leading-[1.2] font-extrabold tracking-tight" style={{ color: INK }}>
                  Never miss a job again.<br />
                  <span style={{ background: `linear-gradient(transparent 62%, ${LIME}99 62%)` }}>Verified alerts in 2 minutes.</span>
                </p>
                <p className="text-[11.5px] font-medium leading-relaxed mt-2" style={{ color: MUTED }}>
                  Upload your resume once. Matching government, private, IT and internship openings reach you on Telegram
                  or the Android app — with the official apply link.
                </p>
              </div>

              <JobPortalPreview />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: SUBTLE }}>How it works</p>
                <div className="grid grid-cols-3 gap-2">
                  {STEPS.map((s, i) => (
                    <div key={s.title} className="rounded-xl px-2.5 py-2.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: LIME, color: INK }}>{i + 1}</span>
                      <span className="block text-[11px] font-bold leading-tight mt-1.5" style={{ color: INK }}>{s.title}</span>
                      <span className="block text-[9.5px] font-medium leading-snug mt-0.5" style={{ color: MUTED }}>{s.body}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                {FACTS.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-px" style={{ background: "#eef8cf" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#4d6b12" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                    <span className="text-[11px] font-semibold leading-snug" style={{ color: "#374151" }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Actions ── */}
            <div className="shrink-0 px-5 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${BORDER}`, background: "#fcfcfd" }}>
              <motion.button
                whileHover={{ scale: 1.015, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => openExternal(JOB_PORTAL_URL)}
                className="flex-1 py-3 rounded-full flex items-center justify-center gap-2 text-[12.5px] font-extrabold"
                style={{ background: INK, color: "#fff", boxShadow: "0 6px 18px rgba(21,22,43,0.28)" }}
              >
                Open job.ghotlyai.in <ExternalIcon />
              </motion.button>
              {[
                { label: "Bot", title: "Telegram bot", url: BOT_URL },
                { label: "Channel", title: "Telegram channel", url: CHANNEL_URL },
              ].map((l) => (
                <motion.button
                  key={l.label}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => openExternal(l.url)}
                  title={l.title}
                  className="px-3.5 py-3 rounded-full flex items-center justify-center gap-1.5 text-[11.5px] font-bold"
                  style={{ background: "#f2f3f6", color: INK, border: `1px solid ${BORDER}` }}
                >
                  <TelegramIcon /> {l.label}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
