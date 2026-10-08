import type { CandidateProfile } from "../../store/useStore";

export type { CandidateProfile };
export type ProfileKey = keyof CandidateProfile;

// Display / iteration order of the 12 profile fields.
export const PROFILE_KEYS: readonly ProfileKey[] = [
  "fullName", "email", "phone", "location",
  "summary", "skills", "experience", "projects",
  "education", "certifications", "linkedin", "github",
] as const;

export const EMPTY_PROFILE: CandidateProfile = {
  fullName: "", email: "", phone: "", location: "",
  summary: "", skills: "", experience: "", projects: "",
  education: "", certifications: "", linkedin: "", github: "",
};

export type ResumeErrorCode =
  | "unsupported_type"  // not PDF / DOCX / TXT / image
  | "too_large"         // > 10 MB
  | "empty"             // 0 bytes / blank file
  | "password"          // password-protected PDF / encrypted Office file
  | "corrupt"           // damaged / not a valid file of its claimed type
  | "no_text"           // opened fine, nothing readable inside
  | "no_key"            // no usable AI key
  | "no_vision_key"     // scanned/image resume but only text-only providers configured
  | "ai_failed"         // provider error that is not covered by a more specific code
  | "bad_json"          // model answered, but not with a usable JSON object
  | "truncated"         // model answer was cut off mid-JSON
  | "no_details"        // JSON ok but nothing resume-like inside
  | "timeout"
  | "offline"
  | "rate_limit"
  | "auth"              // provider rejected the key
  | "model"             // model not available for this key
  | "cancelled";        // user pressed Cancel (not shown as an error)

export class ResumeError extends Error {
  readonly code: ResumeErrorCode;
  // True when running the SAME file again could plausibly succeed (AI-side problems);
  // false when the user has to pick a different file (wrong type, corrupt, ...).
  readonly retryable: boolean;
  constructor(code: ResumeErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "ResumeError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function isResumeError(e: unknown): e is ResumeError {
  return e instanceof ResumeError;
}

export type SourceKind = "pdf" | "docx" | "txt" | "image";

// What the extraction step hands to the AI step.
export type ExtractedResume =
  | { kind: "text"; text: string; source: SourceKind; truncated: boolean }
  // `pages` are JPEG data URLs ("data:image/jpeg;base64,..."), one per page, at most MAX_IMAGE_PAGES.
  | { kind: "images"; pages: string[]; source: SourceKind; totalPages: number };

export const ACCEPT_ATTR =
  ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp," +
  "application/pdf,text/plain,image/png,image/jpeg,image/webp," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
