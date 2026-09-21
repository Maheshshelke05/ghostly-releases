import React from "react";
import { motion } from "framer-motion";

const SITE = "https://job.ghotlyai.in/";
const BOT = "https://t.me/GhostlyAIJobBot";
const CHANNEL = "https://t.me/GhostlyAIJobs";

const LIME = "#a3e635";
const LIME_SOFT = "#d9f99d";
const INK = "#0e0e12";

const open = (url: string) => window.ghostly.openExternal(url);

const ExternalIcon = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

const TelegramIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21.9 4.3 18.7 19.5c-.24 1.07-.87 1.33-1.76.83l-4.87-3.59-2.35 2.26c-.26.26-.48.48-.98.48l.35-4.96 9.03-8.16c.39-.35-.09-.54-.61-.19L6.35 13.2l-4.8-1.5c-1.04-.33-1.06-1.04.22-1.54L20.5 3.03c.87-.32 1.63.2 1.4 1.27Z" />
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

const Reveal: React.FC<{ i?: number; children: React.ReactNode; className?: string }> = ({ i = 0, children, className }) => (
  <motion.section
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.32, delay: Math.min(i * 0.05, 0.4), ease: "easeOut" }}
    className={className}
  >
    {children}
  </motion.section>
);

const SectionTitle: React.FC<{ kicker: string; title: string; right?: React.ReactNode }> = ({ kicker, title, right }) => (
  <div className="flex items-end justify-between mb-2.5">
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: `${LIME}b3` }}>{kicker}</p>
      <h3 className="text-[14px] font-bold text-white/90 font-sans tracking-tight leading-tight mt-0.5">{title}</h3>
    </div>
    {right}
  </div>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    className="inline-flex items-center gap-1 px-2 h-[22px] rounded-full text-[10px] font-semibold font-sans whitespace-nowrap"
    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.72)" }}
  >
    {children}
  </span>
);

const LinkButton: React.FC<{ url: string; children: React.ReactNode; variant?: "primary" | "ghost"; className?: string }> = ({
  url, children, variant = "ghost", className = "",
}) => (
  <button
    onClick={() => open(url)}
    className={`inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-[10px] text-[11px] font-bold font-sans transition-all active:scale-[0.97] ${className}`}
    style={
      variant === "primary"
        ? { background: LIME, color: INK, boxShadow: "0 0 18px rgba(163,230,53,0.35)" }
        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }
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

/* ── data (facts taken from job.ghotlyai.in) ───────────────────────────── */

const STATS = [
  { value: "2 min", label: "posting → your phone" },
  { value: "21", label: "job categories" },
  { value: "3", label: "languages" },
  { value: "₹10", label: "3-day trial" },
];

const SAMPLE_ALERTS = [
  { icon: "🏛", title: "Talathi Bharti 2026 — Solapur", meta: "12th pass · 312 posts · Apply by 24 Sep", tag: "Government" },
  { icon: "🏢", title: "Data Entry Operator — Pune", meta: "Tally + MS Excel · ₹14,000–18,000 · Walk-in Thursday", tag: "Private" },
  { icon: "🎓", title: "Software Intern — Hinjawadi", meta: "BE / BCA freshers · Stipend ₹10,000 · 6 months", tag: "Internship" },
];

const STEPS = [
  { n: "1", title: "Open the bot or the app", body: "Tap /start, pick your language and share your number with Telegram's one-tap contact button." },
  { n: "2", title: "Send your resume", body: "PDF, Word or a clear photo (up to 10 MB). AI fills your profile and suggests categories. No resume? Answer four short questions." },
  { n: "3", title: "Pay ₹10 and start receiving", body: "One UPI payment unlocks three days. Matching jobs arrive within two minutes of being posted, with the deadline on each." },
];

const FEATURES = [
  { icon: "📄", title: "Resume in, profile out", body: "Gemini reads name, qualification, branch, skills, experience and city in about 15 seconds." },
  { icon: "⏱", title: "The 2-minute worker", body: "A scheduler runs every 120 seconds and pushes fresh postings to matching subscribers immediately." },
  { icon: "🗂", title: "21 verified categories", body: "10th pass and ITI trades to B.Com, BE and MBA. Pick up to three so alerts stay relevant." },
  { icon: "🔗", title: "Official apply links", body: "Every link goes to an official career page or government portal. No consultancy numbers, no data resale." },
  { icon: "🎓", title: "Career academy", body: "Tally, Excel, spoken English, typing and exam prep — buy once, keep the access link for life." },
  { icon: "💬", title: "Support that answers back", body: "Type /support in the bot or use the app. Your question reaches the admin desk and the reply returns to the same chat." },
];

const CATEGORIES = [
  "Government", "Banking", "IT / Software", "Data entry", "ITI / Mechanical",
  "Teaching", "BPO / Support", "Work from home", "Agriculture",
];

const COMMANDS = [
  { cmd: "/jobs", desc: "Openings matching your profile right now" },
  { cmd: "/category", desc: "Change the categories your alerts use" },
  { cmd: "/subscribe", desc: "Start the ₹10 trial or renew for 30 days" },
  { cmd: "/language", desc: "English, Marathi or Hindi" },
  { cmd: "/support", desc: "Message the support desk directly" },
];

const COURSES = [
  { title: "Tally Prime with GST", meta: "6 hours · Accounts", was: "₹499", now: "₹299" },
  { title: "Excel for back-office roles", meta: "4 hours · Data entry", was: "₹349", now: "₹199" },
  { title: "Spoken English for interviews", meta: "8 hours · Interview", was: "₹399", now: "₹249" },
];

const FAQ = [
  { q: "Will money be auto-deducted after the trial?", a: "No. There is no recurring mandate and no card stored. When your plan ends, alerts pause and you choose whether to renew." },
  { q: "Do you guarantee a job?", a: "No — and be careful of anyone who does. GhostlyAI delivers verified openings fast and links the official application page. Applying is up to you." },
  { q: "How are duplicate and fake postings stopped?", a: "Each job is fingerprinted from title, company and apply link, so the same vacancy never reaches you twice. Links must point to an official career portal or government site." },
];

/* ── page ──────────────────────────────────────────────────────────────── */

export const JobPortalHeader: React.FC = () => (
  <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
    <span className="relative flex w-1.5 h-1.5">
      <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: LIME }} />
      <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: LIME }} />
    </span>
    <span className="text-[11px] font-semibold font-sans" style={{ color: `${LIME_SOFT}d9` }}>Job Portal</span>
    <span className="text-[10px] font-sans text-white/25">job.ghotlyai.in</span>
  </div>
);

export const JobPortalFooter: React.FC = () => (
  <div
    className="flex-shrink-0 px-4 py-2.5 flex items-center gap-2 border-t border-white/[0.06]"
    style={{ background: "#0b0b0f" }}
  >
    <LinkButton url={SITE} variant="primary" className="flex-1">
      Open job.ghotlyai.in <ExternalIcon />
    </LinkButton>
    <LinkButton url={BOT}>
      <TelegramIcon /> Bot
    </LinkButton>
    <LinkButton url={CHANNEL}>
      <TelegramIcon /> Channel
    </LinkButton>
  </div>
);

export const JobPortalPanel: React.FC = () => {
  let idx = 0;
  const next = () => idx++;

  return (
    <div className="flex flex-col gap-6 pb-2 font-sans">
      {/* ── Hero ── */}
      <Reveal i={next()}>
        <div
          className="relative rounded-2xl overflow-hidden px-5 py-5"
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
              Live engine · checking for new jobs every 2 minutes
            </div>

            <h2 className="mt-3 text-[22px] leading-[1.15] font-extrabold tracking-tight text-white">
              Never miss a job again.
              <br />
              <span style={{ color: LIME }}>Verified alerts in 2 minutes.</span>
            </h2>

            <p className="mt-2.5 text-[12px] leading-relaxed text-white/60 max-w-[520px]">
              GhostlyAI Job Portal is the sister project of this app. Upload your resume once — its Gemini engine reads your
              skills and sends matching government, private, IT and internship openings straight to Telegram or the Android
              app, with the official apply link and never a consultancy number.
            </p>

            <div className="mt-3.5 flex flex-wrap gap-1.5">
              <Chip>✓ Official apply links only</Chip>
              <Chip>✓ ₹10 for 3 days</Chip>
              <Chip>✓ No auto-debit, ever</Chip>
              <Chip>✓ English · मराठी · हिंदी</Chip>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton url={SITE} variant="primary">Visit job.ghotlyai.in <ExternalIcon /></LinkButton>
              <LinkButton url={BOT}><TelegramIcon /> Start on Telegram</LinkButton>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ── Stats ── */}
      <Reveal i={next()}>
        <div className="grid grid-cols-4 gap-2">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-xl px-2 py-2.5 text-center"
              style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="text-[17px] font-extrabold tracking-tight" style={{ color: LIME }}>{s.value}</div>
              <div className="text-[9px] leading-tight text-white/40 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── Sample alerts ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="What you receive" title="An alert looks like this" right={<span className="text-[9px] text-white/25">sample</span>} />
        <div className="flex flex-col gap-1.5">
          {SAMPLE_ALERTS.map((a) => (
            <div
              key={a.title}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div
                className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[15px] shrink-0"
                style={{ background: "rgba(163,230,53,0.09)", border: "1px solid rgba(163,230,53,0.2)" }}
              >
                {a.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-white/90 truncate">{a.title}</p>
                <p className="text-[10.5px] text-white/40 mt-0.5 truncate">{a.meta}</p>
              </div>
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 h-[18px] inline-flex items-center rounded-md shrink-0 mt-0.5"
                style={{ background: "rgba(163,230,53,0.1)", color: LIME_SOFT }}
              >
                {a.tag}
              </span>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── How it works ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="How it works" title="Three steps, about two minutes" />
        <div className="flex flex-col gap-1.5">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 mt-0.5"
                style={{ background: LIME, color: INK }}
              >
                {s.n}
              </div>
              <div>
                <p className="text-[12px] font-semibold text-white/90">{s.title}</p>
                <p className="text-[11px] leading-relaxed text-white/45 mt-0.5">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] text-white/35 leading-relaxed">
          Same flow on Telegram and in the Android app — one profile, one subscription, one support history across both.
        </p>
      </Reveal>

      {/* ── What's inside ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="What's inside" title="Everything behind one alert" />
        <div className="grid grid-cols-2 gap-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[13px]">{f.icon}</span>
                <p className="text-[11.5px] font-semibold text-white/90 leading-tight">{f.title}</p>
              </div>
              <p className="text-[10.5px] leading-relaxed text-white/40 mt-1.5">{f.body}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── Categories ── */}
      <Reveal i={next()}>
        <SectionTitle
          kicker="Categories"
          title="Pick up to three — alerts stay on target"
          right={
            <button
              onClick={() => open(`${SITE}features.html#categories`)}
              className="inline-flex items-center gap-1 text-[10px] font-bold hover:underline"
              style={{ color: LIME }}
            >
              See all 21 <ExternalIcon size={9} />
            </button>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => <Chip key={c}>{c}</Chip>)}
          <span
            className="inline-flex items-center px-2 h-[22px] rounded-full text-[10px] font-bold"
            style={{ background: "rgba(163,230,53,0.1)", border: "1px solid rgba(163,230,53,0.25)", color: LIME_SOFT }}
          >
            +12 more
          </span>
        </div>
      </Reveal>

      {/* ── Pricing ── */}
      <Reveal i={next()}>
        <SectionTitle
          kicker="Pricing"
          title="₹10 to try it. ₹99 a month if it works."
          right={
            <button
              onClick={() => open(`${SITE}pricing.html`)}
              className="inline-flex items-center gap-1 text-[10px] font-bold hover:underline"
              style={{ color: LIME }}
            >
              Pricing &amp; refunds <ExternalIcon size={9} />
            </button>
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl px-3.5 py-3" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">3-day trial</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="text-[24px] font-extrabold text-white tracking-tight">₹10</span>
              <span className="text-[10.5px] text-white/40">for 3 days</span>
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-[10.5px] text-white/55">
              <li>✓ Full matching engine</li>
              <li>✓ Up to 3 categories</li>
              <li>✓ Telegram + app alerts</li>
              <li>✓ Official apply links</li>
            </ul>
          </div>
          <div
            className="relative rounded-xl px-3.5 py-3"
            style={{ background: "linear-gradient(160deg, rgba(163,230,53,0.13), rgba(163,230,53,0.04))", border: "1px solid rgba(163,230,53,0.35)" }}
          >
            <span
              className="absolute top-2.5 right-2.5 text-[8.5px] font-extrabold uppercase tracking-wider px-1.5 h-[16px] inline-flex items-center rounded"
              style={{ background: LIME, color: INK }}
            >
              Most students pick this
            </span>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: LIME_SOFT }}>30-day pass</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="text-[24px] font-extrabold text-white tracking-tight">₹99</span>
              <span className="text-[10.5px] text-white/45">for 30 days</span>
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-[10.5px] text-white/65">
              <li>✓ Everything in the trial</li>
              <li>✓ Unlimited matched alerts</li>
              <li>✓ Deadline countdown on every job</li>
              <li>✓ Two-way support desk</li>
            </ul>
            <p className="mt-2 text-[9.5px]" style={{ color: `${LIME_SOFT}99` }}>Works out to ₹3.30 a day</p>
          </div>
        </div>
        <p className="mt-2 text-[10.5px] text-white/35">No auto-debit mandate, no card stored, no silent renewal — you pay again only when you choose to.</p>
      </Reveal>

      {/* ── Courses ── */}
      <Reveal i={next()}>
        <SectionTitle
          kicker="Career academy"
          title="Skills that get the shortlist"
          right={
            <button
              onClick={() => open(`${SITE}courses.html`)}
              className="inline-flex items-center gap-1 text-[10px] font-bold hover:underline"
              style={{ color: LIME }}
            >
              Browse courses <ExternalIcon size={9} />
            </button>
          }
        />
        <div className="flex flex-col gap-1.5">
          {COURSES.map((c) => (
            <div
              key={c.title}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
              style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-white/85 truncate">{c.title}</p>
                <p className="text-[10px] text-white/35">{c.meta}</p>
              </div>
              <p className="shrink-0 flex items-baseline gap-1.5">
                <span className="text-[10.5px] text-white/30 line-through">{c.was}</span>
                <span className="text-[13px] font-extrabold" style={{ color: LIME }}>{c.now}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] text-white/35">Buy once, keep the access link for life.</p>
      </Reveal>

      {/* ── Bot commands ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="Telegram bot" title="Five commands, that's all" />
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "#09090c", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {COMMANDS.map((c, k) => (
            <div
              key={c.cmd}
              className="flex items-center gap-3 px-3 py-2"
              style={{ borderTop: k === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}
            >
              <code className="text-[11px] font-bold w-[78px] shrink-0" style={{ color: LIME, fontFamily: "ui-monospace, Consolas, monospace" }}>{c.cmd}</code>
              <span className="text-[11px] text-white/50">{c.desc}</span>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── FAQ ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="Good to know" title="Honest answers" />
        <div className="flex flex-col gap-1.5">
          {FAQ.map((f) => (
            <div
              key={f.q}
              className="rounded-xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-[11.5px] font-semibold text-white/85">{f.q}</p>
              <p className="text-[10.5px] leading-relaxed text-white/45 mt-1">{f.a}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── Links ── */}
      <Reveal i={next()}>
        <SectionTitle kicker="Links" title="Everything in one place" />
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Website", sub: "job.ghotlyai.in", url: SITE },
            { label: "Telegram bot", sub: "@GhostlyAIJobBot", url: BOT },
            { label: "Telegram channel", sub: "@GhostlyAIJobs", url: CHANNEL },
            { label: "Help desk", sub: "support@ghostlyai.in", url: "mailto:support@ghostlyai.in" },
          ].map((l) => (
            <button
              key={l.label}
              onClick={() => open(l.url)}
              className="group flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors"
              style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(163,230,53,0.08)"; e.currentTarget.style.borderColor = "rgba(163,230,53,0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.035)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
            >
              <span className="min-w-0">
                <span className="block text-[11.5px] font-semibold text-white/85">{l.label}</span>
                <span className="block text-[10px] text-white/35 truncate">{l.sub}</span>
              </span>
              <span className="text-white/30 group-hover:text-white/70 shrink-0"><ExternalIcon size={11} /></span>
            </button>
          ))}
        </div>
      </Reveal>

      {/* ── Disclaimer ── */}
      <Reveal i={next()}>
        <p className="text-[9.5px] leading-relaxed text-white/30 px-1">
          GhostlyAI Job Portal is a job alert and information service — not a recruitment agency or consultancy. It never charges
          on behalf of an employer and does not guarantee a job, an interview or a result. Always verify details on the official
          portal before you pay anyone anything.
        </p>
      </Reveal>
    </div>
  );
};
