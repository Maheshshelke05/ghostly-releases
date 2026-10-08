// Turns whatever a language model answered into a clean CandidateProfile.
//
// Pure functions only (no DOM, no network) so they can be unit-tested in plain Node.
//
// Models are unreliable JSON writers: they wrap output in code fences, add prose
// before/after, leave trailing commas, use smart quotes or single quotes, forget to
// escape quotes inside text, return arrays/objects where a string was asked for,
// invent keys, or get cut off mid-object. Instead of stacking regex "repairs", the
// object is read with a small tolerant recursive-descent parser (below) that accepts
// all of those and, crucially, KNOWS when the input simply ended too early (truncated).
import type { CandidateProfile, ProfileKey } from "./types";
import { EMPTY_PROFILE, PROFILE_KEYS, ResumeError } from "./types";
import { PROFILE_LIMITS } from "./limits";

// ───────────────────────── tolerant JSON reader ─────────────────────────

class LooseError extends Error {
  readonly atEnd: boolean;
  constructor(message: string, atEnd: boolean) {
    super(message);
    this.atEnd = atEnd;
  }
}

// opening quote -> closing quote
const QUOTE_PAIRS: Record<string, string> = {
  '"': '"',
  "'": "'",
  "`": "`",
  "“": "”", // “ ”
  "‘": "’", // ‘ ’
  "„": "”", // „ ”
  "«": "»", // « »
};
const CURLY_DOUBLE_OPEN = new Set(["“", "„", "«"]);

function isCloser(open: string, c: string): boolean {
  if (c === QUOTE_PAIRS[open]) return true;
  if (CURLY_DOUBLE_OPEN.has(open) && (c === '"' || c === "“")) return true; // models mix straight/curly
  if (open === "‘" && c === "'") return true;
  return false;
}

const isWs = (c: string) =>
  c === " " || c === "\t" || c === "\n" || c === "\r" || c === "﻿" || c === "​" || c === " ";

interface Parsed {
  value: unknown;
  end: number;
}

function parseLoose(src: string, start: number): Parsed {
  const n = src.length;
  let i = start;

  const fail = (msg: string): never => {
    throw new LooseError(msg, i >= n);
  };

  const skipWs = () => {
    while (i < n) {
      const c = src[i];
      if (isWs(c)) i++;
      else if (c === "/" && src[i + 1] === "/") {
        while (i < n && src[i] !== "\n") i++;
      } else if (c === "/" && src[i + 1] === "*") {
        const e = src.indexOf("*/", i + 2);
        i = e < 0 ? n : e + 2;
      } else break;
    }
  };

  // After a candidate closing quote, does what follows look like the end of a JSON string?
  const closesString = (afterQuote: number): boolean => {
    let j = afterQuote;
    let sawNewline = false;
    for (;;) {
      while (j < n && isWs(src[j])) {
        if (src[j] === "\n") sawNewline = true;
        j++;
      }
      if (src[j] === "/" && src[j + 1] === "/") {
        while (j < n && src[j] !== "\n") j++;
      } else if (src[j] === "/" && src[j + 1] === "*") {
        const e = src.indexOf("*/", j + 2);
        j = e < 0 ? n : e + 2;
      } else break;
    }
    if (j >= n) return true;
    const c = src[j];
    if (c === "," || c === "}" || c === "]" || c === ":") return true;
    // Missing comma between members: next member starts on a new line with a quote.
    if (sawNewline && QUOTE_PAIRS[c] !== undefined) return true;
    return false;
  };

  const parseString = (): string => {
    const open = src[i];
    i++;
    let out = "";
    while (i < n) {
      const c = src[i];
      if (c === "\\") {
        const nx = src[i + 1];
        if (nx === undefined) {
          i = n;
          break;
        }
        i += 2;
        switch (nx) {
          case "n": out += "\n"; break;
          case "t": out += "\t"; break;
          case "r": case "b": case "f": break;
          case "u": {
            const hex = src.slice(i, i + 4);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              out += String.fromCharCode(parseInt(hex, 16));
              i += 4;
            } else out += "u";
            break;
          }
          default: out += nx; // \" \\ \/ \' and any unknown escape -> the character itself
        }
        continue;
      }
      if (isCloser(open, c) && closesString(i + 1)) {
        i++;
        return out;
      }
      out += c; // includes raw newlines and unescaped inner quotes
      i++;
    }
    return fail("unterminated string");
  };

  const parseBare = (): unknown => {
    const s0 = i;
    while (i < n && src[i] !== "," && src[i] !== "}" && src[i] !== "]" && src[i] !== "\n") i++;
    const word = src.slice(s0, i).trim();
    if (!word) return fail("empty value");
    const lw = word.toLowerCase();
    if (lw === "null" || lw === "none" || lw === "undefined" || lw === "nil") return null;
    if (lw === "true") return true;
    if (lw === "false") return false;
    if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(word)) return Number(word);
    return word;
  };

  const parseValue = (depth: number): unknown => {
    if (depth > 40) fail("nesting too deep");
    skipWs();
    if (i >= n) fail("unexpected end");
    const c = src[i];
    if (c === "{") return parseObject(depth);
    if (c === "[") return parseArray(depth);
    if (QUOTE_PAIRS[c] !== undefined) return parseString();
    return parseBare();
  };

  const parseObject = (depth: number): Record<string, unknown> => {
    i++; // {
    const obj: Record<string, unknown> = Object.create(null);
    for (;;) {
      skipWs();
      if (i >= n) fail("unexpected end");
      const c = src[i];
      if (c === "}") { i++; return obj; }
      if (c === ",") { i++; continue; } // stray / trailing / doubled commas
      let key: string;
      if (QUOTE_PAIRS[c] !== undefined) key = parseString();
      else {
        const s0 = i;
        while (i < n && src[i] !== ":" && src[i] !== "\n" && src[i] !== "}" && src[i] !== "{") i++;
        key = src.slice(s0, i).trim();
        if (!key) fail("bad key");
      }
      skipWs();
      if (i >= n) fail("unexpected end");
      if (src[i] !== ":") fail("expected ':'");
      i++;
      obj[key] = parseValue(depth + 1);
      skipWs();
      if (i >= n) fail("unexpected end");
      if (src[i] === ",") i++;
      // anything else: a missing comma - the loop simply reads the next member
    }
  };

  const parseArray = (depth: number): unknown[] => {
    i++; // [
    const arr: unknown[] = [];
    for (;;) {
      skipWs();
      if (i >= n) fail("unexpected end");
      const c = src[i];
      if (c === "]") { i++; return arr; }
      if (c === ",") { i++; continue; }
      arr.push(parseValue(depth + 1));
      skipWs();
      if (i >= n) fail("unexpected end");
      if (src[i] === ",") i++;
    }
  };

  const value = parseValue(0);
  return { value, end: i };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ───────────────────────── key mapping ─────────────────────────

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

const CANONICAL: Record<string, ProfileKey> = Object.fromEntries(
  PROFILE_KEYS.map((k) => [normKey(k), k]),
) as Record<string, ProfileKey>;

// Only close variants of the 12 requested keys - anything else is an "unknown key" and ignored.
const ALIASES: Record<string, ProfileKey> = {
  name: "fullName", candidatename: "fullName", yourname: "fullName",
  emailaddress: "email", mail: "email", emailid: "email",
  phonenumber: "phone", mobile: "phone", mobilenumber: "phone", contactnumber: "phone", telephone: "phone",
  address: "location", city: "location", currentlocation: "location",
  professionalsummary: "summary", profilesummary: "summary", objective: "summary", careerobjective: "summary", about: "summary",
  technicalskills: "skills", keyskills: "skills", coreskills: "skills", skillset: "skills",
  workexperience: "experience", professionalexperience: "experience", employment: "experience",
  employmenthistory: "experience", workhistory: "experience",
  personalprojects: "projects", keyprojects: "projects", academicprojects: "projects",
  educationalqualification: "education", academics: "education", qualifications: "education", educationdetails: "education",
  certification: "certifications", certificates: "certifications", certs: "certifications", licenses: "certifications",
  linkedinurl: "linkedin", linkedinprofile: "linkedin", linkedinlink: "linkedin",
  githuburl: "github", githubprofile: "github", githublink: "github",
};

function mapKeys(obj: Record<string, unknown>): Partial<Record<ProfileKey, unknown>> {
  const out: Partial<Record<ProfileKey, unknown>> = {};
  const entries = Object.entries(obj);
  for (const [k, v] of entries) {
    const canon = CANONICAL[normKey(k)];
    if (canon && out[canon] === undefined) out[canon] = v;
  }
  for (const [k, v] of entries) {
    const alias = ALIASES[normKey(k)];
    if (alias && (out[alias] === undefined || out[alias] === null || out[alias] === "")) out[alias] = v;
  }
  return out;
}

function knownKeyCount(obj: Record<string, unknown>): number {
  let c = 0;
  for (const k of Object.keys(obj)) {
    const nk = normKey(k);
    if (CANONICAL[nk] || ALIASES[nk]) c++;
  }
  return c;
}

// {"profile": {...12 keys...}} / {"candidate": {...}} -> the inner object.
function unwrap(obj: Record<string, unknown>): Record<string, unknown> {
  if (knownKeyCount(obj) >= 3) return obj;
  for (const v of Object.values(obj)) {
    if (isPlainObject(v) && knownKeyCount(v) >= 3) return v;
  }
  return obj;
}

// ───────────────────────── extracting the object from model text ─────────────────────────

function cleanModelText(raw: string): string {
  return raw
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, " ") // reasoning models
    .replace(/[​-‍﻿]/g, "");
}

export interface ExtractedJson {
  obj: Record<string, unknown> | null;
  /** The text started a JSON object but ended before it was complete. */
  truncated: boolean;
  /** A valid but empty `{}` was found (the model had nothing to report). */
  emptyObject: boolean;
}

/**
 * Finds the first object in `raw` that parses and looks like a profile.
 * Handles fences, prose around it, trailing commas, smart/single quotes, unescaped inner
 * quotes, raw newlines in strings, `null`/`None`, and objects nested under a wrapper key.
 */
export function extractJsonObject(raw: string): ExtractedJson {
  const text = cleanModelText(raw);
  let truncated = false;
  let emptyObject = false;
  // Once one candidate has failed to parse, the objects NESTED inside it (a project
  // {"name": ...}, an experience entry) must not be mistaken for the profile itself,
  // so they have to look like a real profile (3+ of the known keys).
  let failed = false;
  let attempts = 0;
  for (let i = text.indexOf("{"); i !== -1 && attempts < 30; i = text.indexOf("{", i + 1)) {
    attempts++;
    try {
      const { value } = parseLoose(text, i);
      if (isPlainObject(value)) {
        if (Object.keys(value).length === 0) emptyObject = true;
        const inner = unwrap(value);
        if (knownKeyCount(inner) >= (failed ? 3 : 1)) return { obj: inner, truncated: false, emptyObject: false };
      }
    } catch (e) {
      failed = true;
      if (e instanceof LooseError && e.atEnd) truncated = true;
    }
  }
  return { obj: null, truncated, emptyObject };
}

// ───────────────────────── value coercion ─────────────────────────

type FieldKind = "line" | "list" | "lines" | "text";

const FIELD_KIND: Record<ProfileKey, FieldKind> = {
  fullName: "line", email: "line", phone: "line", location: "line",
  summary: "text", skills: "list", experience: "lines", projects: "lines",
  education: "lines", certifications: "list", linkedin: "line", github: "line",
};

const PLACEHOLDER_RE =
  /^(?:n\s*\/\s*a|n\.a|na|none|null|nil|undefined|unknown|not\s+(?:provided|available|mentioned|specified|found|applicable|listed|given|stated)|no\s+(?:data|info|information|details?)|tbd|[-–—_.?*]+)$/i;

export function isPlaceholder(s: string): boolean {
  return PLACEHOLDER_RE.test(s.trim().replace(/[.\s]+$/, ""));
}

function lookup(o: Record<string, unknown>, names: string[]): unknown {
  const wanted = new Set(names.map(normKey));
  for (const [k, v] of Object.entries(o)) {
    if (wanted.has(normKey(k)) && v != null && v !== "") return v;
  }
  return undefined;
}

const scalar = (v: unknown): string => {
  if (v == null || typeof v === "boolean") return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (Array.isArray(v)) return v.map(scalar).filter(Boolean).join("; ");
  if (isPlainObject(v)) return Object.values(v).map(scalar).filter(Boolean).join(" ");
  return "";
};

const pickText = (o: Record<string, unknown>, names: string[]) => scalar(lookup(o, names));

function datesOf(o: Record<string, unknown>): string {
  const whole = pickText(o, ["dates", "duration", "period", "years", "date", "tenure", "timeline"]);
  if (whole) return whole;
  const from = pickText(o, ["start", "startdate", "from", "startyear", "begin"]);
  const to = pickText(o, ["end", "enddate", "to", "endyear", "until", "present"]);
  if (from && to) return `${from} - ${to}`;
  return from || to;
}

function objectToText(o: Record<string, unknown>, key: ProfileKey, depth: number): string {
  if (key === "experience") {
    const role = pickText(o, ["role", "title", "position", "jobtitle", "designation"]);
    const company = pickText(o, ["company", "employer", "organization", "organisation", "org", "companyname"]);
    if (role || company) {
      const dates = datesOf(o);
      const detail = pickText(o, ["achievements", "highlights", "bullets", "responsibilities", "description", "details", "summary", "points"]);
      return `${role}${company ? `${role ? " @ " : ""}${company}` : ""}${dates ? ` (${dates})` : ""}${detail ? ` — ${detail}` : ""}`;
    }
  } else if (key === "projects") {
    const name = pickText(o, ["name", "title", "project", "projectname"]);
    if (name) {
      const tech = pickText(o, ["tech", "technologies", "stack", "techstack", "tools", "technologiesused", "builtwith"]);
      const desc = pickText(o, ["description", "impact", "details", "highlights", "summary", "outcome", "achievements"]);
      return `${name}${tech ? ` — ${tech}` : ""}${desc ? ` — ${desc}` : ""}`;
    }
  } else if (key === "education") {
    const degree = pickText(o, ["degree", "qualification", "course", "program", "studytype"]);
    const school = pickText(o, ["institution", "school", "university", "college", "institute"]);
    if (degree || school) {
      const field = pickText(o, ["field", "major", "fieldofstudy", "specialization", "branch"]);
      const year = pickText(o, ["year", "graduationyear", "dates", "enddate", "passingyear", "duration"]);
      const grade = pickText(o, ["grade", "gpa", "cgpa", "score", "percentage"]);
      const tail = [year, grade].filter(Boolean).join(", ");
      return `${degree}${field ? `, ${field}` : ""}${school ? `${degree ? " — " : ""}${school}` : ""}${tail ? ` (${tail})` : ""}`;
    }
  } else if (key === "certifications") {
    const name = pickText(o, ["name", "title", "certification", "certificate"]);
    if (name) {
      const meta = [pickText(o, ["issuer", "organization", "authority", "provider"]), pickText(o, ["year", "date", "issued"])]
        .filter(Boolean)
        .join(", ");
      return `${name}${meta ? ` (${meta})` : ""}`;
    }
  }
  // Unknown shape (e.g. skills grouped by category): flatten the values.
  const kind = FIELD_KIND[key];
  return Object.values(o)
    .map((v) => toText(v, key, depth + 1).trim())
    .filter(Boolean)
    .join(kind === "list" ? ", " : " — ");
}

function toText(v: unknown, key: ProfileKey, depth = 0): string {
  if (v == null || depth > 6) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return "";
  const kind = FIELD_KIND[key];
  if (Array.isArray(v)) {
    return v
      .map((x) => toText(x, key, depth + 1).trim())
      .filter((s) => s && !isPlaceholder(s))
      .join(kind === "list" ? ", " : kind === "text" ? " " : "\n");
  }
  if (isPlainObject(v)) return objectToText(v, key, depth);
  return "";
}

// ───────────────────────── per-field clean-up ─────────────────────────

const BULLET_RE = /^\s*(?:[-*•·●▪◦►▶➢✓✔→–—]+|\d{1,2}[.)])\s+/;

function cutAtWord(s: string, limit: number): string {
  if (s.length <= limit) return s;
  const slice = s.slice(0, Math.max(0, limit - 1));
  const sp = slice.lastIndexOf(" ");
  const cut = sp > limit * 0.6 ? slice.slice(0, sp) : slice;
  return cut.replace(/[\s,;:\-–—(]+$/, "") + "…";
}

export function clampField(key: ProfileKey, s: string): string {
  const limit = PROFILE_LIMITS[key];
  if (s.length <= limit) return s;
  switch (FIELD_KIND[key]) {
    case "lines": {
      const kept: string[] = [];
      let len = 0;
      for (const line of s.split("\n")) {
        const add = (kept.length ? 1 : 0) + line.length;
        if (len + add > limit) break;
        kept.push(line);
        len += add;
      }
      return kept.length ? kept.join("\n") : cutAtWord(s.split("\n")[0], limit);
    }
    case "list": {
      const head = s.slice(0, limit);
      const comma = head.lastIndexOf(", ");
      return (comma > limit * 0.5 ? head.slice(0, comma) : cutAtWord(head, limit)).replace(/[,\s]+$/, "");
    }
    case "text": {
      const head = s.slice(0, limit);
      const m = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
      if (m > limit * 0.55) return head.slice(0, m + 1);
      return cutAtWord(s, limit);
    }
    default:
      return cutAtWord(s, limit);
  }
}

/** linkedin / github -> "linkedin.com/in/handle" / "github.com/handle" (no scheme, www, query or trailing slash). */
export function normalizeProfileUrl(raw: string, kind: "linkedin" | "github"): string {
  let s = raw.trim();
  const md = s.match(/\]\(\s*((?:https?:\/\/)?[^)\s]+)\s*\)/); // [text](url)
  if (md) s = md[1];
  s = s.replace(/^[<(\["']+|[>)\]"'.,;]+$/g, "").trim();
  s = s.replace(/^(?:linkedin|github)(?:\s+profile)?\s*[:\-–]\s*/i, ""); // "LinkedIn: linkedin.com/in/x"
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^www\./i, "");
  const multiToken = /\s/.test(s.split(/[?#]/)[0].trim());
  s = s.split(/[?#\s]/)[0].replace(/\/+$/, "");
  if (!s || isPlaceholder(s)) return "";
  const handleOnly = !s.includes("/") && !s.includes(".");
  if (handleOnly) {
    // A bare handle must be ONE token that looks like a handle - free text ("not a url!!") is not.
    const handle = s.replace(/^@/, "");
    if (multiToken || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(handle)) return "";
    s = kind === "linkedin" ? `linkedin.com/in/${handle}` : `github.com/${handle}`;
  } else if (kind === "linkedin" && /^(?:in|pub|company)\//i.test(s)) s = `linkedin.com/${s}`;
  else if (kind === "github" && s.startsWith("@")) s = `github.com/${s.slice(1)}`;
  const slash = s.indexOf("/");
  let host = (slash === -1 ? s : s.slice(0, slash)).toLowerCase();
  const path = slash === -1 ? "" : s.slice(slash);
  if (kind === "linkedin" && /(^|\.)linkedin\.com$/.test(host)) host = "linkedin.com"; // in.linkedin.com, uk.linkedin.com ...
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)) return "";
  if (!path && (host === "linkedin.com" || host === "github.com")) return ""; // no profile handle
  return host + path;
}

function finalizeField(key: ProfileKey, text: string): string {
  const kind = FIELD_KIND[key];
  const flat = text
    .replace(/\r\n?/g, "\n")
    .replace(/[​-‍﻿­]/g, "")
    .replace(/[ \t\f\v ]+/g, " ");
  let lines = flat
    .split("\n")
    .map((l) => (kind === "lines" || kind === "list" ? l.replace(BULLET_RE, "") : l).trim())
    .filter((l) => l && !isPlaceholder(l));
  if (!lines.length) return "";

  let out: string;
  switch (key) {
    case "email": {
      const m = lines.join(" ").match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/);
      out = m ? m[0] : "";
      break;
    }
    case "phone": {
      const m = lines.join(" ").match(/\+?\(?\d[\d\s().-]{5,}\d/);
      const digits = m ? m[0].replace(/\D/g, "") : "";
      out = m && digits.length >= 7 && digits.length <= 15 ? m[0].replace(/\s+/g, " ").trim() : "";
      break;
    }
    case "linkedin":
    case "github":
      out = normalizeProfileUrl(lines[0], key);
      break;
    case "fullName":
      out = lines[0].split(/\s+[|•·]\s+|\s{2,}/)[0].replace(/\s+/g, " ").trim();
      break;
    case "location":
      out = lines.join(", ").replace(/\s+/g, " ").trim();
      break;
    case "summary":
      out = lines.join(" ").replace(/\s+/g, " ").trim();
      break;
    default: {
      if (kind === "list") {
        const seen = new Set<string>();
        const items = lines
          .join(", ")
          .split(/\s*[,;|•·●▪◦]\s*|\s*\n\s*/)
          .map((x) => x.trim())
          .filter((x) => x && !isPlaceholder(x))
          .filter((x) => {
            const k = x.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        out = items.join(", ");
      } else {
        lines = lines.map((l) => l.replace(/\s+/g, " "));
        // Some models glue the entries into ONE line separated by " | ". Split only when every piece looks like a
        // complete entry (long enough and carrying "@", "(" or a " - " separator), so a genuine "Role | Company" line stays.
        if (lines.length === 1 && lines[0].includes(" | ")) {
          const segs = lines[0].split(/\s+\|\s+/).map((x) => x.trim()).filter(Boolean);
          if (segs.length >= 2 && segs.every((x) => x.length >= 20 && /[@(]|\s[-–—]\s/.test(x))) lines = segs;
        }
        out = lines.join("\n");
      }
    }
  }
  return clampField(key, out);
}

// ───────────────────────── public API ─────────────────────────

/** Any parsed value -> CandidateProfile with all 12 keys as clean, clamped strings. */
export function normalizeProfile(input: unknown): CandidateProfile {
  const result: CandidateProfile = { ...EMPTY_PROFILE };
  if (!isPlainObject(input)) return result;
  const mapped = mapKeys(unwrap(input));
  for (const key of PROFILE_KEYS) {
    result[key] = finalizeField(key, toText(mapped[key], key));
  }
  return result;
}

export function countFilled(p: CandidateProfile): number {
  return PROFILE_KEYS.filter((k) => !!p[k]?.trim()).length;
}

/**
 * Model answer text -> profile. Throws ResumeError("truncated" | "bad_json" | "no_details").
 * `retryable` is true for all three: running the same file again often fixes them.
 */
export function parseResumeResponse(raw: string): CandidateProfile {
  const { obj, truncated, emptyObject } = extractJsonObject(raw ?? "");
  if (!obj) {
    if (truncated) {
      throw new ResumeError("truncated", "The AI's answer was cut off before it finished. Please try again.", true);
    }
    if (emptyObject) {
      throw new ResumeError(
        "no_details",
        "We couldn't find any resume details in that file. Check that it is a resume, or fill the fields in by hand.",
        false,
      );
    }
    throw new ResumeError("bad_json", "The AI answered in an unexpected format. Please try again.", true);
  }
  const profile = normalizeProfile(obj);
  if (countFilled(profile) === 0) {
    throw new ResumeError(
      "no_details",
      "We couldn't find any resume details in that file. Check that it is a resume, or fill the fields in by hand.",
      false,
    );
  }
  return profile;
}

// ───────────────────────── merging into the form ─────────────────────────

export interface MergeResult {
  next: CandidateProfile;
  /** Keys whose value actually changed (for the highlight animation). */
  changed: ProfileKey[];
  /** Keys now holding resume-derived values (so a later "Replace"/"Remove" knows what is "theirs"). */
  filled: ProfileKey[];
}

/**
 * Applies an imported profile on top of the current form values.
 *  - a field the resume provides overwrites the current value;
 *  - a field the resume does NOT provide keeps the user's manual value,
 *    unless it was filled by the PREVIOUS import and not edited since (stale -> cleared).
 */
export function mergeImportedProfile(
  current: CandidateProfile,
  imported: CandidateProfile,
  previouslyAutoFilled: ReadonlySet<ProfileKey>,
): MergeResult {
  const next: CandidateProfile = { ...current };
  const changed: ProfileKey[] = [];
  const filled: ProfileKey[] = [];
  for (const k of PROFILE_KEYS) {
    const v = imported[k]?.trim() ?? "";
    if (v) {
      if (next[k] !== v) changed.push(k);
      next[k] = v;
      filled.push(k);
    } else if (previouslyAutoFilled.has(k) && next[k]) {
      next[k] = "";
      changed.push(k);
    }
  }
  return { next, changed, filled };
}

/** Clears exactly the fields a resume filled (and the user has not edited since). */
export function removeAutoFilled(current: CandidateProfile, autoFilled: ReadonlySet<ProfileKey>): CandidateProfile {
  const next: CandidateProfile = { ...current };
  for (const k of autoFilled) next[k] = "";
  return next;
}

/** Strips anything token-like (long opaque strings) before showing provider text to the user. */
export function redactForDisplay(text: string, max = 160): string {
  const cleaned = text.replace(/[A-Za-z0-9_\-.]{24,}/g, "…").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}
