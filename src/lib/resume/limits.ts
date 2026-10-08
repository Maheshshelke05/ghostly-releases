// Per-field size limits for the candidate profile. ONE source of truth, shared by:
//   - resume/parse.ts   (clamps whatever the model returns)
//   - resume/prompt.ts  (tells the model to stay inside them)
//   - prompts.ts        (how much of each field goes into an interview prompt)
// so a resume that was auto-filled never gets silently cut off when it is later
// used to answer questions.
//
// Raised modestly over the original prompt-context limits (summary 600, skills 600, experience 1200, projects 1200,
// education 300, certifications 300) so a real two-job resume is not truncated; the worst case (every field full)
// still adds only about 1.5k tokens to a prompt (see unit/prompts.test.ts).
export const PROFILE_LIMITS = {
  fullName: 80,
  email: 120,
  phone: 40,
  location: 80,
  summary: 600,
  skills: 600,
  experience: 1400,
  projects: 1400,
  education: 350,
  certifications: 350,
  linkedin: 100,
  github: 100,
} as const;

// Resume files. 10 MB is plenty for a CV and keeps the in-renderer parse fast.
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
// Only the first pages matter for a resume; this also bounds work on a huge PDF.
export const MAX_TEXT_PAGES = 10;
// Scanned/image resumes are rendered to JPEG and sent to a vision model.
export const MAX_IMAGE_PAGES = 3;
export const IMAGE_LONG_SIDE = 1600;
export const IMAGE_JPEG_QUALITY = 0.8;
// Resume text sent to the model (about 7-8k tokens) - far more than any real CV.
export const MAX_RESUME_CHARS = 30000;
// Fewer readable characters than this in a PDF means it is a scan/image PDF.
export const MIN_TEXT_CHARS = 120;
// One model call is cancelled after this long (ms).
export const AI_TIMEOUT_MS = 45000;
