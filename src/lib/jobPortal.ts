/**
 * GhotlyAI Job Portal (https://job.ghotlyai.in) — live data + official links for the desktop app.
 *
 * Rule for everything the Job Portal tab / popup shows: a statement is either quoted from the live website
 * (the page is noted next to the copy below) or it is a value the live public API returns at runtime — the very same
 * endpoints the website's own script (assets/js/site.js) calls. Nothing is invented. When unsure, it is left out.
 *
 * Network behaviour (the public endpoints are rate-limited per IP on the server, so this is deliberately gentle):
 *  - one request per endpoint, cached for 5 minutes at module level, so re-opening the tab costs nothing;
 *  - concurrent callers share the in-flight request (de-dupe); there is no polling and no background timer;
 *  - every request is aborted after 8 s; any failure (offline, timeout, 4xx/5xx, malformed JSON) falls back to the
 *    snapshot constants below — the same "baked values stay if the live call fails" approach the website uses.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";

/* ── official links (every one of these is linked from the live site) ───────────────────────────────────────────── */

export const SITE_URL = "https://job.ghotlyai.in/";
export const API_URL = "https://api.ghotlyai.in";
export const SUPPORT_EMAIL = "support@ghotlyai.in";

export const LINKS = {
  site: SITE_URL,
  features: `${SITE_URL}features.html`,
  howItWorks: `${SITE_URL}how-it-works.html`,
  install: `${SITE_URL}how-it-works.html#install`,
  iphone: `${SITE_URL}how-it-works.html#iphone`,
  pricing: `${SITE_URL}pricing.html`,
  about: `${SITE_URL}about.html`,
  courses: `${SITE_URL}courses.html`,
  contact: `${SITE_URL}contact.html`,
  privacy: `${SITE_URL}privacy.html`,
  terms: `${SITE_URL}terms.html`,
  refunds: `${SITE_URL}terms.html#refunds`,
  webApp: "https://app.ghotlyai.in",
  androidApk: `${API_URL}/releases/student/latest`,
  support: `mailto:${SUPPORT_EMAIL}`,
} as const;

/* ── types ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface PortalStats {
  students: number;
  jobsWeek: number;
  categories: number;
  /** Seconds between new-job checks (the website's "2 min between new-job checks"). */
  delaySec: number;
}

export interface PortalSettings {
  priceInr: number;
  trialPriceInr: number;
  subscriptionDays: number;
  trialDays: number;
  maxCategories: number;
}

export interface PortalJob {
  title: string;
  company: string;
  /** Raw API value: "govt" | "private" | "internship" | "wfh". */
  type: string;
  city: string;
  postedAgo: string;
}

export interface PortalData {
  stats: PortalStats;
  settings: PortalSettings;
  categories: string[];
  jobs: PortalJob[];
}

export type PartKey = keyof PortalData;
export type PartStatus = "loading" | "live" | "fallback";

export interface PortalState {
  /** Always complete: live values where the API answered, snapshot values otherwise. */
  data: PortalData;
  /** Overall: "fallback" as soon as any requested part failed, "loading" until all answered, else "live". */
  status: PartStatus;
  /** Per endpoint, so a section can show its own skeleton / empty state. */
  parts: Record<PartKey, PartStatus>;
  /** User-initiated re-fetch of whatever failed (never automatic — there is no polling). */
  retry: () => void;
}

/* ── fallback snapshot (the live API on 2026-10-07) — used only when the API cannot be reached ───────────────────
   The tab labels these as "Saved" figures. students / jobsWeek drift every day; everything else rarely changes. */

export const FALLBACK_STATS: PortalStats = { students: 214, jobsWeek: 5603, categories: 40, delaySec: 120 };

export const FALLBACK_SETTINGS: PortalSettings = {
  priceInr: 99,
  trialPriceInr: 10,
  subscriptionDays: 31,
  trialDays: 3,
  maxCategories: 5,
};

export const FALLBACK_CATEGORIES: string[] = [
  "Government Jobs", "Banking & Insurance", "IT / Software", "Data Entry / Computer Operator", "Accounts / Finance",
  "Sales / Marketing", "BPO / Customer Support", "Teaching / Education", "Healthcare / Nursing", "Pharma / Medical Rep",
  "ITI / Mechanical", "Electrical / Electronics", "Civil / Construction", "Manufacturing / Production",
  "HR / Admin / Office", "Design / Media", "Hotel / Hospitality", "Retail / Store", "Delivery / Logistics / Driver",
  "Agriculture", "Software Developer / Programmer", "DevOps / Cloud Engineer", "QA / Software Testing",
  "Data Science / Analytics", "IT Support / Networking", "UI/UX Design", "Cybersecurity", "Legal / Law",
  "Content Writing / Journalism", "Real Estate", "Automobile / Workshop", "Security Guard / Services",
  "Beauty / Wellness", "Event Management", "Social Work / NGO", "Insurance", "Fitness / Sports Trainer",
  "Warehouse / Supply Chain", "Police / Defense / Railway", "Other",
];

/** Never made up: with no live answer there are simply no openings to show. */
export const FALLBACK_JOBS: PortalJob[] = [];

/* ── fetching ───────────────────────────────────────────────────────────────────────────────────────────────────── */

const TIMEOUT_MS = 8_000;
const TTL_OK_MS = 5 * 60_000; // successful answers are reused for 5 minutes
const TTL_FAIL_MS = 15_000; // after a failure, don't retry on every tab flip
const TTL_RATE_LIMITED_MS = 120_000; // HTTP 429: the server asked us to slow down

/** The API accepts 1..20; the tab lists this many, the popup / sponsor preview show the first three of the same list. */
export const RECENT_JOBS_LIMIT = 5;

class HttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function getJson(path: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new HttpError(res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9;
const isPositive = (v: unknown): v is number => isCount(v) && v >= 1;
const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

function record(raw: unknown, what: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${what}: unexpected response`);
  return raw as Record<string, unknown>;
}

function parseStats(raw: unknown): PortalStats {
  const o = record(raw, "stats");
  if (!isCount(o.students) || !isCount(o.jobs_week) || !isCount(o.categories)) throw new Error("stats: bad fields");
  return {
    students: o.students,
    jobsWeek: o.jobs_week,
    categories: o.categories,
    delaySec: isPositive(o.avg_delay_sec) ? o.avg_delay_sec : FALLBACK_STATS.delaySec,
  };
}

function parseSettings(raw: unknown): PortalSettings {
  const o = record(raw, "settings");
  const { price_inr, trial_price_inr, subscription_days, trial_days, max_categories } = o;
  if (!isCount(price_inr) || !isCount(trial_price_inr) || !isPositive(subscription_days) || !isPositive(trial_days) || !isPositive(max_categories)) {
    throw new Error("settings: bad fields");
  }
  return {
    priceInr: price_inr,
    trialPriceInr: trial_price_inr,
    subscriptionDays: subscription_days,
    trialDays: trial_days,
    maxCategories: max_categories,
  };
}

function parseCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("categories: not a list");
  const names = [...new Set(raw.map((c) => clean((c as { name?: unknown } | null)?.name, 80)).filter(Boolean))];
  if (!names.length) throw new Error("categories: empty"); // the list is never really empty — treat it as a failed answer
  return names;
}

function parseJobs(raw: unknown): PortalJob[] {
  if (!Array.isArray(raw)) throw new Error("jobs: not a list");
  return raw
    .slice(0, RECENT_JOBS_LIMIT)
    .map((j) => {
      const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
      return {
        title: clean(o.title, 140),
        company: clean(o.company, 80),
        type: clean(o.type, 24),
        city: clean(o.city, 60),
        postedAgo: clean(o.posted_ago, 24),
      };
    })
    .filter((j) => j.title); // a genuinely empty list is a valid answer ("no openings right now")
}

const SPECS: { [K in PartKey]: { path: string; parse: (raw: unknown) => PortalData[K]; fallback: PortalData[K] } } = {
  stats: { path: "/public/stats", parse: parseStats, fallback: FALLBACK_STATS },
  settings: { path: "/student/settings", parse: parseSettings, fallback: FALLBACK_SETTINGS },
  categories: { path: "/student/categories?lang=en", parse: parseCategories, fallback: FALLBACK_CATEGORIES },
  jobs: { path: `/public/jobs/recent?limit=${RECENT_JOBS_LIMIT}`, parse: parseJobs, fallback: FALLBACK_JOBS },
};

/* ── module-level cache + in-flight de-dupe, exposed to React through a tiny external store ────────────────────── */

interface Entry {
  value: unknown;
  ok: boolean;
  at: number;
  ttl: number;
}

const cache: Partial<Record<PartKey, Entry>> = {};
const lastGood: Partial<Record<PartKey, unknown>> = {};
const inflight: Partial<Record<PartKey, Promise<void>>> = {};
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getVersion = () => version;

const isFresh = (key: PartKey) => {
  const e = cache[key];
  return !!e && Date.now() - e.at < e.ttl;
};

function load(key: PartKey, force = false): Promise<void> {
  if (!force && isFresh(key)) return Promise.resolve();
  const running = inflight[key];
  if (running) return running;

  const spec = SPECS[key];
  const p: Promise<void> = getJson(spec.path)
    .then((raw) => {
      const value = spec.parse(raw);
      lastGood[key] = value;
      cache[key] = { value, ok: true, at: Date.now(), ttl: TTL_OK_MS };
    })
    .catch((err: unknown) => {
      const ttl = err instanceof HttpError && err.status === 429 ? TTL_RATE_LIMITED_MS : TTL_FAIL_MS;
      // Keep the last good answer if we ever had one; otherwise the snapshot constants.
      cache[key] = { value: lastGood[key] ?? spec.fallback, ok: false, at: Date.now(), ttl };
    })
    .finally(() => {
      delete inflight[key];
      emit();
    });
  inflight[key] = p;
  return p;
}

const ALL_PARTS: readonly PartKey[] = ["stats", "settings", "categories", "jobs"];

/**
 * Live Job Portal data. `parts` limits which endpoints this caller needs (the sponsor preview only needs "jobs"),
 * and nothing is fetched until a component using the hook is actually mounted.
 */
export function useJobPortalData(parts: readonly PartKey[] = ALL_PARTS): PortalState {
  useSyncExternalStore(subscribe, getVersion);
  const wanted = parts.join(",");

  useEffect(() => {
    (wanted.split(",") as PartKey[]).forEach((k) => {
      void load(k);
    });
  }, [wanted]);

  const retry = useCallback(() => {
    (wanted.split(",") as PartKey[]).forEach((k) => {
      if (cache[k] && !cache[k]!.ok) {
        delete cache[k]; // back to "loading" so the skeletons return while we ask again
        void load(k, true);
      }
    });
    emit();
  }, [wanted]);

  const read = <K extends PartKey>(k: K): PortalData[K] => (cache[k]?.value as PortalData[K] | undefined) ?? SPECS[k].fallback;
  const part = (k: PartKey): PartStatus => (!cache[k] ? "loading" : cache[k]!.ok ? "live" : "fallback");

  const statuses = Object.fromEntries(ALL_PARTS.map((k) => [k, part(k)])) as Record<PartKey, PartStatus>;
  const asked = wanted.split(",") as PartKey[];
  const status: PartStatus = asked.some((k) => statuses[k] === "fallback")
    ? "fallback"
    : asked.some((k) => statuses[k] === "loading")
      ? "loading"
      : "live";

  return {
    data: { stats: read("stats"), settings: read("settings"), categories: read("categories"), jobs: read("jobs") },
    status,
    parts: statuses,
    retry,
  };
}

/* ── formatting ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/** "₹99" — the website formats rupees with Indian digit grouping too. */
export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export const num = (n: number) => n.toLocaleString("en-IN");
export const formatDelay = (sec: number) => (sec >= 60 ? `${+(sec / 60).toFixed(1)} min` : `${sec} sec`);

/** API job_type → the website's wording (Government · Private · Internship · Work from home). */
export const jobTypeLabel = (type: string): string => {
  const t = type.toLowerCase();
  if (t === "govt" || t === "government") return "Government";
  if (t === "private") return "Private";
  if (t === "internship") return "Internship";
  if (t === "wfh" || t === "work from home" || t === "work_from_home") return "Work from home";
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

export const jobTypeIcon = (type: string): string => {
  const t = type.toLowerCase();
  if (t === "govt" || t === "government") return "🏛";
  if (t === "internship") return "🎓";
  if (t === "wfh" || t === "work from home" || t === "work_from_home") return "🏠";
  return "🏢";
};

/** "Rentomojo · Bengaluru · 14h ago" — built exactly like the website's "Just posted" ticker. */
export const jobMeta = (j: PortalJob) => [j.company, j.city, j.postedAgo].filter(Boolean).join(" · ");

/* ── copy quoted from the live site (page noted) — shared by the tab and the popup ──────────────────────────────── */

export const COPY = {
  /** job.ghotlyai.in — page <title> and nav */
  brand: "GhotlyAI Job Portal",
  /** job.ghotlyai.in — <title>: "GhotlyAI Job Portal — Job alerts for students, matched to your resume" */
  tagline: "Job alerts for students",
  /** every page footer — the site's own one-line description (HomePage.tsx's sponsor popup can show this under COPY.brand) */
  blurb: "Government, private, internship and work-from-home jobs for students and freshers, scam-checked, matched to your resume and sent within minutes.",
  /** / — hero <h1>: "Your next job, <em>told to you first.</em>" */
  headlineLead: "Your next job, ",
  headlineEm: "told to you first.",
  /** / — hero paragraph */
  intro:
    "Government, private, internship and work-from-home jobs for students and freshers — scam-checked, matched to your resume and sent to your phone within minutes of being posted. Browse everything free. Pay only to open and apply.",
  /** / — hero paragraph, first sentence only (popup) */
  introShort:
    "Government, private, internship and work-from-home jobs for students and freshers — scam-checked, matched to your resume and sent to your phone within minutes of being posted.",
  /** / — "Why this exists" */
  whyTitle: "The vacancy is public. The news, usually late.",
  whyBody:
    "GhotlyAI closes that gap. Our team and our job research add new jobs every day, a worker checks every two minutes, and each student is told only about what fits them — with the employer's own apply link.",
  /** /about.html — "Our story" */
  whoFor:
    "Students and freshers across Maharashtra — 10th and 12th pass, ITI and diploma holders, graduates in commerce, science, engineering and nursing — and anyone preparing for competitive exams or a first private-sector job.",
  /** / — "Four job types" cards */
  jobTypes: [
    { name: "Government", body: "Central, state and local recruitments and exams." },
    { name: "Private", body: "Company openings for freshers and experienced hires." },
    { name: "Internship", body: "Paid and unpaid internships to start your record." },
    { name: "Work from home", body: "Remote roles you can do from your own town." },
  ],
  /** /features.html — "Rules you can predict" */
  matchRules: [
    "Its category is one you picked",
    "Its type — government, private, internship, work from home — is one you chose (or you chose none)",
    "Its last date has not passed",
    "It was posted in the last seven days",
    "It has not already been sent to you",
  ],
  /** /pricing.html — "Free vs plan" table */
  freeList: [
    "Browse every job in your categories",
    "Skill-ranked feed with star matches",
    "Buy and open courses",
    "Support chat and help desk",
  ],
  planList: ["Open a job's details and official apply link", "New-job alerts by push and email"],
  /** /index.html FAQ (answers quoted as published) */
  faq: [
    {
      q: "Is GhotlyAI a recruitment agency? Do you guarantee a job?",
      a: "No. GhotlyAI is a job alert and information service. Our team adds vacancies published by employers and government bodies, and every job links to the official apply page. We never guarantee a job, an interview or a shortlist, and we never take money on an employer's behalf.",
    },
    {
      q: "Do I have to pay just to see jobs?",
      a: "No. After you sign in and pick your categories you can browse every matching job for free. A plan is needed to open a job's details and its official apply link, and to receive new-job alerts.",
    },
    {
      q: "How fast do alerts arrive?",
      a: "A background worker runs every two minutes. When it finds new jobs that match your categories and job types, you get a push notification on the Android app and an email, so a job posted this minute usually reaches you within a few minutes.",
    },
    {
      q: "What happens to my resume? Is it shared?",
      a: "Your resume is read by Google's Gemini AI to fill in your education, skills and projects so we can rank jobs that fit you and suggest categories. It is optional, you can replace it any time, and we never share it with employers or sell it. You only reach an employer when you tap Apply and submit on their own portal.",
    },
    {
      q: "How do I get the Android app?",
      a: "Tap Download for Android, open the file and allow the installation when Android asks. After that the app tells you when a newer version is ready, so you never have to download it again by hand.",
    },
    {
      q: "I use an iPhone. Can I still use GhotlyAI?",
      a: "Yes. Open app.ghotlyai.in in Safari, sign in with Google, then tap Share and Add to Home Screen. It works like an app, and new-job alerts reach you by email.",
    },
    {
      q: "I paid but my plan is not active.",
      a: "Access normally switches on within a minute of a successful payment. If it has not, open Support in the app or write to support@ghotlyai.in with your payment ID and we will activate it. If money was deducted and access did not activate, we refund the full amount.",
    },
  ],
  /** /contact.html */
  scamWarning: "Anyone asking you for money to apply through a GhotlyAI alert — do not pay.",
  /** every page footer — the site's own disclaimer */
  disclaimer:
    "GhotlyAI is a job alert and information service. We are not a recruitment agency or consultancy, we never take money on an employer's behalf, and we do not guarantee a job, an interview or any result. Always verify details on the official notification before you pay anyone anything.",
  /** /about.html — closing line */
  disclaimerShort:
    "GhotlyAI is an alert and information service. We are not a recruitment agency or a consultancy, and we do not promise employment.",
} as const;

/**
 * /how-it-works.html "Set up in four steps". "{max}" is replaced by the live category limit
 * (the website fills the same number in from /student/settings) — see `fillMax`.
 */
export const HOW_IT_WORKS = [
  {
    title: "Sign in with Google",
    body: "Tap Continue with Google and pick your account. There is no password to remember and no OTP to wait for.",
    short: "There is no password to remember and no OTP to wait for.",
  },
  {
    title: "Add your resume — or skip",
    body: "Upload a PDF, a Word file or a photo. In a few seconds you see what the AI found: education, college, skills and projects. Skipping is fine — you can add it from Profile whenever you like.",
    short: "Skipping is fine — you can add it from Profile whenever you like.",
  },
  {
    title: "Pick job types and categories",
    body: "Choose any of government, private, internship and work from home (or none to see everything), then pick up to {max} categories. If you uploaded a resume we show the best-fitting ones first.",
    short: "Pick up to {max} categories.",
  },
  {
    title: "Browse, then unlock",
    body: "You land on your feed straight away. Scroll everything for free; when you want to open a job and apply, start a plan — the trial takes about a minute and the job opens the moment payment succeeds.",
    short: "Scroll everything for free; when you want to open a job and apply, start a plan.",
  },
] as const;

/** Splits copy around the "{max}" placeholder so a component can drop in a value (or a skeleton) there. */
export const splitMax = (text: string): [string, string | null] => {
  const at = text.indexOf("{max}");
  return at < 0 ? [text, null] : [text.slice(0, at), text.slice(at + "{max}".length)];
};
