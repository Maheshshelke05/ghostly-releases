import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  COPY,
  HOW_IT_WORKS,
  LINKS,
  SUPPORT_EMAIL,
  formatDelay,
  inr,
  jobMeta,
  jobTypeIcon,
  jobTypeLabel,
  num,
  splitMax,
  useJobPortalData,
  type PortalJob,
} from "../lib/jobPortal";

// Everything on this tab is either quoted from https://job.ghotlyai.in (shared copy lives next to the fetch code in
// src/lib/jobPortal.ts; the feature cards and pricing bullets are below) or comes from the live public API at runtime.
// Short labels, buttons and status messages are the only wording that is not a site quote.

const LIME = "#a3e635";
const LIME_SOFT = "#d9f99d";
const INK = "#0e0e12";
const SURFACE: React.CSSProperties = { background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" };
const SKEL = "rgba(255,255,255,0.10)";

/** How many category chips are listed before "+N more". */
const CATEGORY_CHIPS = 12;

const openLink = (url: string) => window.ghostly.openExternal(url);

const ExternalIcon = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const JobIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <path d="M2 13h20" />
  </svg>
);

/* ── small building blocks ─────────────────────────────────────────────── */

const Reveal: React.FC<{ i?: number; children: React.ReactNode; className?: string; busy?: boolean }> = ({ i = 0, children, className, busy }) => (
  <motion.section
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.32, delay: Math.min(i * 0.05, 0.4), ease: "easeOut" }}
    className={className}
    aria-busy={busy || undefined}
  >
    {children}
  </motion.section>
);

const SectionTitle: React.FC<{ kicker: string; title: React.ReactNode; right?: React.ReactNode }> = ({ kicker, title, right }) => (
  <div className="flex items-end justify-between gap-3 mb-2.5">
    <div className="min-w-0">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: `${LIME}b3` }}>{kicker}</p>
      <h3 className="text-[14px] font-bold text-white/90 font-sans tracking-tight leading-tight mt-0.5">{title}</h3>
    </div>
    {right}
  </div>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    className="inline-flex items-center gap-1 px-2 h-[22px] rounded-full text-[10px] font-semibold font-sans whitespace-nowrap"
    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.78)" }}
  >
    {children}
  </span>
);

const LinkButton: React.FC<{ url: string; children: React.ReactNode; variant?: "primary" | "ghost"; className?: string; title?: string }> = ({
  url, children, variant = "ghost", className = "", title,
}) => (
  <button
    onClick={() => openLink(url)}
    title={title}
    className={`inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-[10px] text-[11px] font-bold font-sans whitespace-nowrap transition-all active:scale-[0.97] ${className}`}
    style={
      variant === "primary"
        ? { background: LIME, color: INK, boxShadow: "0 0 18px rgba(163,230,53,0.35)" }
        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.82)" }
    }
    onMouseEnter={(e) => {
      if (variant === "primary") e.currentTarget.style.background = LIME_SOFT;
      else e.currentTarget.style.background = "rgba(255,255,255,0.09)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = variant === "primary" ? LIME : "rgba(255,255,255,0.05)";
    }}
  >
    {children}
  </button>
);

const TextLink: React.FC<{ url: string; children: React.ReactNode }> = ({ url, children }) => (
  <button
    onClick={() => openLink(url)}
    className="inline-flex items-center gap-1 text-[10px] font-bold hover:underline shrink-0"
    style={{ color: LIME }}
  >
    {children} <ExternalIcon size={9} />
  </button>
);

/** A value that comes from the live API: a shimmer block until the first answer arrives, then the value. */
const Val: React.FC<{ loading: boolean; w?: number; children: React.ReactNode }> = ({ loading, w = 26, children }) =>
  loading ? (
    <span
      className="inline-block align-middle rounded animate-pulse"
      style={{ width: w, height: "0.8em", background: SKEL }}
      aria-hidden="true"
    />
  ) : (
    <>{children}</>
  );

/** Copy containing "{max}" with the live category limit (or a skeleton) dropped in. */
const WithMax: React.FC<{ text: string; max: number; loading: boolean }> = ({ text, max, loading }) => {
  const [before, after] = splitMax(text);
  return after === null ? <>{text}</> : <>{before}<Val loading={loading} w={10}>{max}</Val>{after}</>;
};

const Notice: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <motion.div
    initial={{ opacity: 0, y: -6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    role="status"
    className="flex items-center gap-3 rounded-xl px-3 py-2"
    style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}
  >
    <p className="flex-1 text-[10.5px] leading-snug text-amber-100/80">
      Couldn't reach the live site just now — showing saved figures where needed.
    </p>
    <button
      onClick={onRetry}
      className="shrink-0 h-6 px-2.5 rounded-lg text-[10px] font-bold text-amber-100/90 hover:bg-white/10 transition-colors"
      style={{ border: "1px solid rgba(251,191,36,0.3)" }}
    >
      Try again
    </button>
  </motion.div>
);

const Check: React.FC = () => (
  <span className="shrink-0 mt-[3px]" style={{ color: LIME }} aria-hidden="true">
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
  </span>
);

const Lock: React.FC = () => (
  <span className="shrink-0 mt-[3px] text-white/35" aria-hidden="true">
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
  </span>
);

/* ── static copy quoted from /features.html ────────────────────────────── */

const FEATURES = [
  { kicker: "Alerts", title: "Every two minutes, only what is new", body: "A background worker runs every two minutes. A job is never sent to the same student twice." },
  { kicker: "Resume", title: "A resume that reads itself", body: "Upload a PDF, a Word file or a clear photo. Google's Gemini AI extracts what matters and fills in your profile, so you never type it all out." },
  { kicker: "Ranking", title: "Jobs that fit your skills come first", body: "Jobs that mention your skills or projects are pushed to the top of each page and marked Matches your profile." },
  { kicker: "Applying", title: "The safe way to apply", body: "Every job links to the employer's or exam board's own application page. We never take fees on an employer's behalf." },
];

/* ── page pieces ───────────────────────────────────────────────────────── */

const FeatureCard: React.FC<{ f: { kicker: string; title: string; body: string } }> = ({ f }) => (
  <div className="rounded-xl px-3.5 py-3" style={SURFACE}>
    <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: `${LIME}b3` }}>{f.kicker}</p>
    <p className="text-[11.5px] font-semibold text-white/90 leading-tight mt-1">{f.title}</p>
    <p className="text-[10.5px] leading-relaxed text-white/55 mt-1.5">{f.body}</p>
  </div>
);

const Faq: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="flex flex-col gap-1.5">
      {COPY.faq.map((f, i) => {
        const isOpen = openIdx === i;
        return (
          <div key={f.q} className="rounded-xl overflow-hidden" style={SURFACE}>
            <button
              onClick={() => setOpenIdx(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
            >
              <span className="text-[11.5px] font-semibold text-white/85 leading-snug">{f.q}</span>
              <span className="text-white/40 shrink-0"><ChevronIcon open={isOpen} /></span>
            </button>
            {isOpen && <p className="px-3 pb-3 text-[11px] leading-relaxed text-white/60">{f.a}</p>}
          </div>
        );
      })}
    </div>
  );
};

const JobRow: React.FC<{ job: PortalJob }> = ({ job }) => {
  const label = jobTypeLabel(job.type);
  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={SURFACE}>
      <div
        className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[15px] shrink-0"
        style={{ background: "rgba(163,230,53,0.09)", border: "1px solid rgba(163,230,53,0.2)" }}
        aria-hidden="true"
      >
        {jobTypeIcon(job.type)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-white/90 truncate" title={job.title}>{job.title}</p>
        <p className="text-[10.5px] text-white/50 mt-0.5 truncate" title={jobMeta(job)}>{jobMeta(job)}</p>
      </div>
      {label && (
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 h-[18px] inline-flex items-center rounded-md shrink-0 mt-0.5"
          style={{ background: "rgba(163,230,53,0.1)", color: LIME_SOFT }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

const JobSkeleton: React.FC = () => (
  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={SURFACE}>
    <div className="w-8 h-8 rounded-[10px] animate-pulse shrink-0" style={{ background: SKEL }} />
    <div className="flex-1 flex flex-col gap-2">
      <div className="h-2.5 rounded animate-pulse" style={{ width: "64%", background: SKEL }} />
      <div className="h-2 rounded animate-pulse" style={{ width: "38%", background: SKEL }} />
    </div>
  </div>
);

/* ── header / footer (hosted by Home.tsx) ──────────────────────────────── */

export const JobPortalHeader: React.FC = () => (
  <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
    <span className="relative flex w-1.5 h-1.5">
      <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: LIME }} />
      <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: LIME }} />
    </span>
    <span className="text-[11px] font-semibold font-sans" style={{ color: `${LIME_SOFT}d9` }}>Job Portal</span>
    <span className="text-[10px] font-sans text-white/40">job.ghotlyai.in</span>
  </div>
);

export const JobPortalFooter: React.FC = () => (
  <div
    className="flex-shrink-0 px-4 py-2.5 flex items-center gap-2 border-t border-white/[0.06]"
    style={{ background: "#0b0b0f" }}
  >
    <LinkButton url={LINKS.site} variant="primary" className="flex-1">
      Open job.ghotlyai.in <ExternalIcon />
    </LinkButton>
    <LinkButton url={LINKS.webApp} title="app.ghotlyai.in — works on iPhone, PC, anywhere">Web app</LinkButton>
    <LinkButton url={LINKS.androidApk} title="Android app (APK)">Download APK</LinkButton>
  </div>
);

/* ── the tab ───────────────────────────────────────────────────────────── */

export const JobPortalPanel: React.FC = () => {
  const { data, status, parts, retry } = useJobPortalData();
  const { stats, settings, categories, jobs } = data;
  const statsLoading = parts.stats === "loading";
  const settingsLoading = parts.settings === "loading";
  const catsLoading = parts.categories === "loading";
  const jobsLoading = parts.jobs === "loading";

  const shownCategories = categories.slice(0, CATEGORY_CHIPS);
  const moreCategories = Math.max(0, categories.length - shownCategories.length);
  const statTiles = [
    { value: num(stats.students), label: "students on the platform" },
    { value: num(stats.jobsWeek), label: "jobs added this week" },
    { value: num(stats.categories), label: "job categories" },
    { value: formatDelay(stats.delaySec), label: "between new-job checks" },
  ];

  let idx = 0;
  const next = () => idx++;

  return (
    <div className="flex flex-col gap-5 pb-2 font-sans">
      {status === "fallback" && <Notice onRetry={retry} />}

      {/* ── Hero ── */}
      <Reveal i={next()}>
        <div
          className="relative rounded-2xl overflow-hidden px-5 py-4"
          style={{
            background: "linear-gradient(135deg, #14180b 0%, #10130a 55%, #0e0e12 100%)",
            border: "1px solid rgba(163,230,53,0.2)",
          }}
        >
          <div
            className="absolute -top-16 -right-10 w-56 h-56 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(163,230,53,0.20), transparent 65%)" }}
          />
          <div className="relative">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 h-[22px] rounded-full text-[9.5px] font-bold"
              style={{ background: "rgba(163,230,53,0.10)", border: "1px solid rgba(163,230,53,0.28)", color: LIME_SOFT }}
            >
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: LIME }} />
                <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: LIME }} />
              </span>
              <span>
                {parts.stats === "fallback" ? "Saved" : "Live"} · <Val loading={statsLoading} w={30}>{num(stats.jobsWeek)}</Val> jobs added this week
              </span>
            </div>

            <h2 className="mt-3 text-[22px] leading-[1.15] font-extrabold tracking-tight text-white">
              {COPY.headlineLead}<span style={{ color: LIME }}>{COPY.headlineEm}</span>
            </h2>

            <p className="mt-2.5 text-[12px] leading-relaxed text-white/65 max-w-[560px]">{COPY.intro}</p>

            <div className="mt-3.5 flex flex-wrap gap-1.5">
              <Chip>✓ Browse everything free</Chip>
              <Chip><span>✓ Plans start at <Val loading={settingsLoading} w={22}>{inr(settings.trialPriceInr)}</Val>, one time</span></Chip>
              <Chip>✓ No auto-renewal</Chip>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton url={LINKS.webApp} variant="primary">Open the web app <ExternalIcon /></LinkButton>
              <LinkButton url={LINKS.androidApk}>Download for Android</LinkButton>
            </div>
            <p className="mt-3 text-[10.5px] text-white/50">
              On an iPhone? The web app works like an app —{" "}
              <button onClick={() => openLink(LINKS.iphone)} className="underline underline-offset-2 hover:text-white/80" style={{ color: LIME_SOFT }}>see how</button>.
            </p>
          </div>
        </div>
      </Reveal>

      {/* ── Stats (live) ── */}
      <Reveal i={next()} busy={statsLoading}>
        <div className="grid grid-cols-4 gap-2">
          {statTiles.map((s) => (
            <div key={s.label} className="rounded-xl px-2 py-2.5 text-center" style={SURFACE}>
              <div className="text-[17px] font-extrabold tracking-tight min-h-[22px] flex items-center justify-center" style={{ color: LIME }}>
                <Val loading={statsLoading} w={44}>{s.value}</Val>
              </div>
              <div className="text-[9.5px] leading-tight text-white/50 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── What it is / who it's for ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="Why it exists" title={COPY.whyTitle} />
        <div className="rounded-xl px-3.5 py-3" style={SURFACE}>
          <p className="text-[11.5px] leading-relaxed text-white/70">{COPY.whyBody}</p>
          <p className="mt-3 text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: `${LIME}b3` }}>Who it's for</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-white/70">{COPY.whoFor}</p>
        </div>
      </Reveal>

      {/* ── How it works ── */}
      <Reveal i={next()}>
        <SectionTitle
          kicker="How it works"
          title="Set up in four steps."
          right={<TextLink url={LINKS.install}>Install guide</TextLink>}
        />
        <div className="grid grid-cols-2 gap-2">
          {HOW_IT_WORKS.map((s, n) => (
            <div key={s.title} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={SURFACE}>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 mt-0.5"
                style={{ background: LIME, color: INK }}
              >
                {n + 1}
              </div>
              <div>
                <p className="text-[12px] font-semibold text-white/90">{s.title}</p>
                <p className="text-[11px] leading-relaxed text-white/60 mt-0.5">
                  <WithMax text={s.body} max={settings.maxCategories} loading={settingsLoading} />
                </p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── What you get ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="Features" title="Everything the app does for you." right={<TextLink url={LINKS.features}>All features</TextLink>} />
        <div className="grid grid-cols-2 gap-2">
          {FEATURES.slice(0, 2).map((f) => <FeatureCard key={f.kicker} f={f} />)}

          <div className="col-span-2 rounded-xl px-3.5 py-3" style={SURFACE}>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: `${LIME}b3` }}>Matching</p>
            <p className="text-[11.5px] font-semibold text-white/90 leading-tight mt-1">Rules you can predict</p>
            <p className="text-[10.5px] leading-relaxed text-white/55 mt-1.5">
              A job reaches you only when all of these are true — so you can always work out why you did (or did not) get one:
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {COPY.matchRules.map((r) => (
                <li key={r} className="flex items-start gap-2 text-[10.5px] leading-snug text-white/70">
                  <Check />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {FEATURES.slice(2).map((f) => <FeatureCard key={f.kicker} f={f} />)}
        </div>
      </Reveal>

      {/* ── Categories (live) ── */}
      <Reveal i={next()} busy={catsLoading}>
        <SectionTitle
          kicker="Coverage"
          title={<><Val loading={statsLoading} w={18}>{num(stats.categories)}</Val> categories, four job types</>}
          right={<TextLink url={LINKS.features}>See all <Val loading={catsLoading} w={14}>{num(categories.length)}</Val></TextLink>}
        />
        <p className="text-[10.5px] leading-relaxed text-white/55 mb-2.5">
          From government exams and banking to IT, healthcare, teaching, ITI trades, logistics and agriculture — pick up to{" "}
          <Val loading={settingsLoading} w={10}>{settings.maxCategories}</Val> categories, and choose government, private, internship or work from home (or all of them).
        </p>
        <div className="flex flex-wrap gap-1.5">
          {catsLoading
            ? [64, 92, 78, 110, 70, 96, 84, 58, 102, 74, 88, 66].map((w, i) => (
                <span key={i} className="inline-block h-[22px] rounded-full animate-pulse" style={{ width: w, background: SKEL }} />
              ))
            : shownCategories.map((c) => <Chip key={c}>{c}</Chip>)}
          {!catsLoading && moreCategories > 0 && (
            <span
              className="inline-flex items-center px-2 h-[22px] rounded-full text-[10px] font-bold"
              style={{ background: "rgba(163,230,53,0.1)", border: "1px solid rgba(163,230,53,0.25)", color: LIME_SOFT }}
            >
              +{moreCategories} more
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {COPY.jobTypes.map((t) => (
            <div key={t.name} className="rounded-xl px-3 py-1.5" style={SURFACE}>
              <p className="text-[11px] font-semibold text-white/90">{t.name}</p>
              <p className="text-[10px] leading-snug text-white/55">{t.body}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── Pricing (live) ── */}
      <Reveal i={next()} busy={settingsLoading}>
        <SectionTitle
          kicker="Pricing"
          title="Honest prices. No auto-renewal."
          right={<TextLink url={LINKS.pricing}>Pricing &amp; refunds</TextLink>}
        />
        <p className="text-[10.5px] leading-relaxed text-white/55 mb-2.5">
          Two plans, paid once through Razorpay. When a plan ends it simply ends — nothing is charged again unless you choose to renew.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl px-3.5 py-3" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Trial · once per student</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[24px] font-extrabold text-white tracking-tight"><Val loading={settingsLoading} w={44}>{inr(settings.trialPriceInr)}</Val></span>
              <span className="text-[10.5px] text-white/55">for <Val loading={settingsLoading} w={10}>{settings.trialDays}</Val> days</span>
            </p>
            <p className="mt-1.5 text-[10.5px] leading-snug text-white/55">See everything work for you before committing to a month.</p>
            <ul className="mt-2 flex flex-col gap-1 text-[10.5px] text-white/65">
              {["Full access to every feature", "Push and email alerts for new matches", "Open any job and apply", "One time only — no auto-renewal"].map((t) => (
                <li key={t} className="flex items-start gap-1.5"><Check /><span>{t}</span></li>
              ))}
            </ul>
          </div>
          <div
            className="rounded-xl px-3.5 py-3"
            style={{ background: "linear-gradient(160deg, rgba(163,230,53,0.13), rgba(163,230,53,0.04))", border: "1px solid rgba(163,230,53,0.35)" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: LIME_SOFT }}>Monthly</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[24px] font-extrabold text-white tracking-tight"><Val loading={settingsLoading} w={44}>{inr(settings.priceInr)}</Val></span>
              <span className="text-[10.5px] text-white/60">for <Val loading={settingsLoading} w={14}>{settings.subscriptionDays}</Val> days</span>
            </p>
            <p className="mt-1.5 text-[10.5px] leading-snug text-white/60">The plan for when you are actively applying.</p>
            <ul className="mt-2 flex flex-col gap-1 text-[10.5px] text-white/75">
              {["Everything in the trial", "Renew any time — days stack", "No card on file, no auto-debit", "Pay again only when you choose to"].map((t) => (
                <li key={t} className="flex items-start gap-1.5"><Check /><span>{t}</span></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-xl px-3.5 py-3" style={SURFACE}>
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/50">Free, without a plan</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[10.5px] leading-snug text-white/70">
              {COPY.freeList.map((t) => <li key={t} className="flex items-start gap-1.5"><Check /><span>{t}</span></li>)}
            </ul>
          </div>
          <div className="rounded-xl px-3.5 py-3" style={SURFACE}>
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/50">Needs a plan</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[10.5px] leading-snug text-white/70">
              {COPY.planList.map((t) => <li key={t} className="flex items-start gap-1.5"><Lock /><span>{t}</span></li>)}
            </ul>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1 text-[10.5px] leading-relaxed text-white/50">
          <p>Courses are priced separately and never require a plan.</p>
          <p>
            If money was deducted and your access did not activate, or you paid twice, we refund in full. Active plans and opened courses are not refundable.{" "}
            <button onClick={() => openLink(LINKS.refunds)} className="underline underline-offset-2 hover:text-white/80" style={{ color: LIME_SOFT }}>Refund policy</button>
          </p>
          <p>All prices are in Indian rupees and include applicable taxes.</p>
        </div>
      </Reveal>

      {/* ── Latest openings (live) ── */}
      <Reveal i={next()} busy={jobsLoading}>
        <SectionTitle kicker="Live" title="Just posted" right={<TextLink url={LINKS.site}>More on job.ghotlyai.in</TextLink>} />
        <div className="flex flex-col gap-1.5" role={jobsLoading ? "status" : undefined} aria-label={jobsLoading ? "Loading the latest openings" : undefined}>
          {jobsLoading ? (
            [0, 1, 2, 3, 4].map((i) => <JobSkeleton key={i} />)
          ) : jobs.length > 0 ? (
            jobs.map((j, i) => <JobRow key={`${j.title}-${j.company}-${i}`} job={j} />)
          ) : (
            <div className="rounded-xl px-3.5 py-4 text-center text-[11px] text-white/50" style={SURFACE}>
              {parts.jobs === "fallback"
                ? "The latest openings couldn't be loaded just now. They'll appear here when the site can be reached."
                : "No openings are listed right now."}
            </div>
          )}
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-white/50">A plan is needed to open a job's details and its apply link, and to receive alerts.</p>
      </Reveal>

      {/* ── Courses (link only — the live catalogue is read on the site) ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="Courses" title="Learn something worth adding to a resume." right={<TextLink url={LINKS.courses}>See courses</TextLink>} />
        <div className="rounded-xl px-3.5 py-3" style={SURFACE}>
          <p className="text-[11.5px] leading-relaxed text-white/70">
            Short courses, sold on their own — pay once, unlock the course link straight away. Independent of any plan.
          </p>
          <p className="mt-2 text-[10.5px] leading-relaxed text-white/50">
            Courses are sold separately from plans and are not refundable once the course link has been opened, since the content is delivered immediately.
          </p>
        </div>
      </Reveal>

      {/* ── FAQ ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="Questions" title="Everything students ask before they start." />
        <Faq />
      </Reveal>

      {/* ── Links ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="Links" title="Get the app, get help" />
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Website", sub: "job.ghotlyai.in", url: LINKS.site },
            { label: "Web app — iPhone, PC, anywhere", sub: "app.ghotlyai.in", url: LINKS.webApp },
            { label: "Android app (APK)", sub: "Download APK", url: LINKS.androidApk },
            { label: "About", sub: "Built because the news arrived too late", url: LINKS.about },
            { label: "Contact & support", sub: "You do not need to be signed in", url: LINKS.contact },
            { label: "Email", sub: SUPPORT_EMAIL, url: LINKS.support },
            { label: "Privacy policy", sub: "Written to be read", url: LINKS.privacy },
            { label: "Terms & refunds", sub: "The agreement, without the maze", url: LINKS.terms },
          ].map((l) => (
            <button
              key={l.label}
              onClick={() => openLink(l.url)}
              className="group flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors"
              style={SURFACE}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(163,230,53,0.08)"; e.currentTarget.style.borderColor = "rgba(163,230,53,0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.035)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
            >
              <span className="min-w-0">
                <span className="block text-[11.5px] font-semibold text-white/85 truncate">{l.label}</span>
                <span className="block text-[10px] text-white/50 truncate">{l.sub}</span>
              </span>
              <span className="text-white/35 group-hover:text-white/70 shrink-0"><ExternalIcon size={11} /></span>
            </button>
          ))}
        </div>

        <p
          className="mt-2.5 rounded-xl px-3.5 py-2.5 text-[10.5px] leading-relaxed text-white/70"
          style={{ background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.22)" }}
        >
          {COPY.scamWarning} Report it{" "}
          <button onClick={() => openLink(LINKS.contact)} className="underline underline-offset-2 font-semibold hover:text-white" style={{ color: "#fdba74" }}>here</button>{" "}
          with the job title and we will take the posting down.
        </p>
      </Reveal>

      {/* ── Disclaimer (the site's own wording) ── */}
      <Reveal i={next()}>
        <p className="text-[10px] leading-relaxed text-white/50 px-1">{COPY.disclaimer}</p>
      </Reveal>
    </div>
  );
};
