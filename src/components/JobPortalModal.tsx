import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  COPY,
  HOW_IT_WORKS,
  LINKS,
  SITE_URL,
  inr,
  jobMeta,
  jobTypeIcon,
  num,
  splitMax,
  useJobPortalData,
} from "../lib/jobPortal";

// Everything here is quoted from https://job.ghotlyai.in (copy lives in src/lib/jobPortal.ts) or comes from the live
// public API at runtime — see the notes there. The data hooks only run while the popup / preview is actually mounted.

export const JOB_PORTAL_URL = SITE_URL;

const INK = "#15162b";
const MUTED = "#6b7280";
const BORDER = "#e8e8ee";
const SURFACE = "#f7f7fa";
const LIME = "#a3e635";
const SKEL = "rgba(21,22,43,0.09)";

/** The preview (also used by the sponsor popup) shows this many of the same list the tab loads. */
const PREVIEW_COUNT = 3;

const openExternal = (url: string) => window.ghostly.openExternal(url);

const PreviewSkeleton: React.FC = () => (
  <div className="flex items-center gap-2 rounded-[10px] px-2 py-1.5" style={{ background: "#ffffff" }}>
    <span className="w-6 h-6 rounded-lg shrink-0 animate-pulse" style={{ background: SKEL }} />
    <span className="flex-1 flex flex-col gap-1.5">
      <span className="block h-2 rounded animate-pulse" style={{ width: "66%", background: SKEL }} />
      <span className="block h-1.5 rounded animate-pulse" style={{ width: "40%", background: SKEL }} />
    </span>
  </div>
);

// Small preview of what the Job Portal delivers: the three newest openings, read live from the site's own public API.
// Shared with the sponsor popup. Never shows made-up jobs — if the API can't be reached it says so.
export const JobPortalPreview: React.FC = () => {
  const { data, parts, retry } = useJobPortalData(["jobs"]);
  const state = parts.jobs;
  const jobs = data.jobs.slice(0, PREVIEW_COUNT);

  return (
    <div
      className="relative shrink-0 rounded-[14px] overflow-hidden px-3 pt-2.5 pb-3"
      style={{ background: "linear-gradient(135deg, #f6fbe4 0%, #eef8cf 100%)", border: "1px solid #dcebb0" }}
      aria-busy={state === "loading" || undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-[8.5px] font-black uppercase tracking-[0.12em]" style={{ color: "#4d6b12" }}>
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: "#65a30d" }} />
            <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: "#65a30d" }} />
          </span>
          Just posted
        </span>
        <span className="text-[8.5px] font-bold" style={{ color: "#556b2a" }}>job.ghotlyai.in</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {state === "loading" ? (
          [0, 1, 2].map((i) => <PreviewSkeleton key={i} />)
        ) : jobs.length > 0 ? (
          jobs.map((j, i) => (
            <motion.div
              key={`${j.title}-${j.company}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 + i * 0.1, ease: "easeOut" }}
              className="flex items-center gap-2 rounded-[10px] px-2 py-1.5"
              style={{ background: "#ffffff", boxShadow: "0 1px 0 rgba(20,20,40,0.04), 0 2px 8px rgba(77,107,18,0.08)" }}
            >
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[12px] shrink-0" style={{ background: "#f0f7d8" }} aria-hidden="true">
                {jobTypeIcon(j.type)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-bold leading-tight truncate" style={{ color: INK }} title={j.title}>{j.title}</span>
                <span className="block text-[9px] font-medium truncate" style={{ color: MUTED }} title={jobMeta(j)}>{jobMeta(j)}</span>
              </span>
            </motion.div>
          ))
        ) : (
          <div className="rounded-[10px] px-2.5 py-3 text-center text-[9.5px] font-medium leading-snug" style={{ background: "#ffffff", color: MUTED }}>
            {state === "fallback" ? (
              <>
                The latest openings couldn't be loaded just now.{" "}
                <button onClick={retry} className="font-bold underline underline-offset-2" style={{ color: "#4d6b12" }}>Try again</button>
              </>
            ) : (
              "No openings are listed right now."
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const BriefcaseIcon: React.FC<{ size?: number; color?: string }> = ({ size = 13, color = INK }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <path d="M2 13h20" />
  </svg>
);

const ExternalIcon = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

/** A value from the live API: a light shimmer until the first answer arrives. */
const Val: React.FC<{ loading: boolean; w?: number; children: React.ReactNode }> = ({ loading, w = 22, children }) =>
  loading ? (
    <span className="inline-block align-middle rounded animate-pulse" style={{ width: w, height: "0.8em", background: SKEL }} aria-hidden="true" />
  ) : (
    <>{children}</>
  );

const WithMax: React.FC<{ text: string; max: number; loading: boolean }> = ({ text, max, loading }) => {
  const [before, after] = splitMax(text);
  return after === null ? <>{text}</> : <>{before}<Val loading={loading} w={9}>{max}</Val>{after}</>;
};

const CheckDot: React.FC = () => (
  <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-px" style={{ background: "#eef8cf" }} aria-hidden="true">
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#4d6b12" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
  </span>
);

/** The popup's scrolling content. Mounted only while the popup is open, so the data hook only runs then. */
const ModalBody: React.FC = () => {
  const { data, parts } = useJobPortalData(["settings", "stats"]);
  const { settings, stats } = data;
  const settingsLoading = parts.settings === "loading";
  const statsLoading = parts.stats === "loading";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
      <div>
        <p className="text-[19px] leading-[1.2] font-extrabold tracking-tight" style={{ color: INK }}>
          {COPY.headlineLead}
          <span style={{ background: `linear-gradient(transparent 62%, ${LIME}99 62%)` }}>{COPY.headlineEm}</span>
        </p>
        <p className="text-[11.5px] font-medium leading-relaxed mt-2" style={{ color: MUTED }}>{COPY.introShort}</p>
      </div>

      <JobPortalPreview />

      <div>
        <p className="text-[9.5px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: MUTED }}>How it works</p>
        <div className="grid grid-cols-2 gap-2">
          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.title} className="rounded-xl px-2.5 py-2.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: LIME, color: INK }}>{i + 1}</span>
              <span className="block text-[11px] font-bold leading-tight mt-1.5" style={{ color: INK }}>{s.title}</span>
              <span className="block text-[9.5px] font-medium leading-snug mt-0.5" style={{ color: MUTED }}>
                <WithMax text={s.short} max={settings.maxCategories} loading={settingsLoading} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <CheckDot />
          <span className="text-[11px] font-semibold leading-snug" style={{ color: "#374151" }}>Browse everything free. Pay only to open and apply.</span>
        </div>
        <div className="flex items-start gap-2">
          <CheckDot />
          <span className="text-[11px] font-semibold leading-snug" style={{ color: "#374151" }}>Every job carries the employer's or exam board's official apply link.</span>
        </div>
        <div className="flex items-start gap-2">
          <CheckDot />
          <span className="text-[11px] font-semibold leading-snug" style={{ color: "#374151" }}>
            <Val loading={statsLoading} w={16}>{num(stats.categories)}</Val> categories, four job types
          </span>
        </div>
        <div className="flex items-start gap-2">
          <CheckDot />
          <span className="text-[11px] font-semibold leading-snug" style={{ color: "#374151" }}>
            <span className="block">
              Trial <Val loading={settingsLoading} w={22}>{inr(settings.trialPriceInr)}</Val> for <Val loading={settingsLoading} w={8}>{settings.trialDays}</Val> days · Monthly <Val loading={settingsLoading} w={22}>{inr(settings.priceInr)}</Val> for <Val loading={settingsLoading} w={12}>{settings.subscriptionDays}</Val> days
            </span>
            <span className="block mt-0.5 font-medium" style={{ color: MUTED }}>No card on file, no auto-debit</span>
          </span>
        </div>
      </div>

      <p className="text-[9.5px] font-medium leading-relaxed" style={{ color: MUTED }}>{COPY.disclaimerShort}</p>
    </div>
  );
};

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
            aria-label={COPY.brand}
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
                  <h2 className="text-[15px] font-bold leading-tight truncate" style={{ color: INK }}>{COPY.brand}</h2>
                  <p className="text-[10.5px] font-semibold mt-0.5 truncate" style={{ color: MUTED }}>{COPY.tagline} · job.ghotlyai.in</p>
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

            {/* ── Body (live) ── */}
            <ModalBody />

            {/* ── Actions ── */}
            <div className="shrink-0 px-5 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${BORDER}`, background: "#fcfcfd" }}>
              <motion.button
                whileHover={{ scale: 1.015, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => openExternal(JOB_PORTAL_URL)}
                className="flex-1 py-3 rounded-full flex items-center justify-center gap-2 text-[12.5px] font-extrabold whitespace-nowrap"
                style={{ background: INK, color: "#fff", boxShadow: "0 6px 18px rgba(21,22,43,0.28)" }}
              >
                Open job.ghotlyai.in <ExternalIcon />
              </motion.button>
              {[
                { label: "Web app", title: "Open the web app (app.ghotlyai.in) — works on iPhone, PC, anywhere", url: LINKS.webApp },
                { label: "Android", title: "Download for Android (APK)", url: LINKS.androidApk },
              ].map((l) => (
                <motion.button
                  key={l.label}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => openExternal(l.url)}
                  title={l.title}
                  className="px-3.5 py-3 rounded-full flex items-center justify-center text-[11.5px] font-bold whitespace-nowrap"
                  style={{ background: "#f2f3f6", color: INK, border: `1px solid ${BORDER}` }}
                >
                  {l.label}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
