import type { CandidateProfile, InterviewSession } from "../store/useStore";
import { PROFILE_LIMITS } from "./resume/limits";

// ───────────────────────── candidate resume facts ─────────────────────────
//
// The candidate's profile (typed by hand or filled from an uploaded resume) reaches the model through ONE
// compact "CANDIDATE RESUME FACTS" block that every answer path shares:
//   live transcript      -> buildLiveInterviewPrompt  (via buildSessionContext)
//   screen analysis      -> buildPrompt               (via buildSessionContext)
//   chat tab             -> buildChatPrompt           (Home.tsx must call it - see its doc comment)
//   follow-up question   -> buildFollowUpPrompt       (ditto)
// The block is included whenever a profile exists - not only when the question *sounds* personal - because
// questions like "have you used Redis?" or "why this role?" are easy to mis-classify, and a technical answer
// is better when it can point at a real project. isPersonalQuestion() only decides how hard the prompt leans
// on the facts. Field sizes come from resume/limits.ts, the same limits the resume importer clamps to, so an
// imported profile is never silently cut off here. Email and phone are deliberately NOT sent: answering
// never needs them.

const FACTS_HEADER = "CANDIDATE RESUME FACTS";

/** Collapses whitespace and cuts at a line/word boundary, never mid-word. */
function squeeze(raw: string | undefined, max: number): string {
  const t = (raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const nl = head.lastIndexOf("\n");
  const sp = head.lastIndexOf(" ");
  const at = nl > max * 0.6 ? nl : sp > max * 0.6 ? sp : max;
  return head.slice(0, at).trimEnd() + "…";
}

/** True when the profile has any content a model could actually use (contact details alone do not count). */
export function hasResumeFacts(p: CandidateProfile | null | undefined): p is CandidateProfile {
  return !!p && [p.fullName, p.summary, p.skills, p.experience, p.projects, p.education, p.certifications]
    .some((v) => typeof v === "string" && v.trim().length > 0);
}

/** The "CANDIDATE RESUME FACTS" block ("" when the session has no usable profile). */
export function buildResumeFacts(session: InterviewSession | null | undefined): string {
  const p = session?.profile;
  if (!hasResumeFacts(p)) return "";
  const L = PROFILE_LIMITS;
  const lines: string[] = [
    `${FACTS_HEADER} (the candidate's real background - the ONLY source for claims about their own past):`,
  ];
  const add = (label: string, value: string | undefined, max: number) => {
    const v = squeeze(value, max);
    if (!v) return;
    lines.push(v.includes("\n") ? `- ${label}:\n${v}` : `- ${label}: ${v}`);
  };
  add("Name", p.fullName, L.fullName);
  add("Location", p.location, L.location);
  add("Summary", p.summary, L.summary);
  add("Skills", p.skills, L.skills);
  add("Experience", p.experience, L.experience);
  add("Projects", p.projects, L.projects);
  add("Education", p.education, L.education);
  add("Certifications", p.certifications, L.certifications);
  add("GitHub", p.github, L.github);
  add("LinkedIn", p.linkedin, L.linkedin);
  return lines.join("\n");
}

const FACTS_RULES = `HOW TO USE THE RESUME FACTS
- Questions about the candidate personally (background, experience, projects, skills, strengths, "why this role/company", "tell me about..."): answer in the FIRST PERSON as the candidate, using the facts above - real projects, technologies, employers, numbers.
- Technical or coding questions: answer on the merits; mention a real project or technology from the facts only where it genuinely fits, in one short clause.
- Tailor what you emphasise to the company and the position above.
- NEVER invent or stretch employers, job titles, dates, degrees, metrics, project names or skills that are not in the facts. If the facts don't cover the question, answer in general terms without claiming experience you cannot back up.`;

export function buildSessionContext(session: InterviewSession | null | undefined): string {
  if (!session) return "";

  let ctx = `\n\n---\nINTERVIEW CONTEXT:\n- Company: ${session.companyName}\n- Position: ${session.position}\n- Interview Language: ${session.language}`;

  if (session.description) {
    ctx += `\n- Job Description / Custom Instructions: ${session.description}`;
  }

  const facts = buildResumeFacts(session);
  if (facts) ctx += `\n\n${facts}`;
  ctx += "\n---";
  if (facts) ctx += `\n\n${FACTS_RULES}`;
  return ctx;
}

// ───────────────────────── "is this question about the candidate?" ─────────────────────────
//
// Interview questions are phrased in countless ways, and live transcripts have no punctuation, so this is a
// list of loose patterns rather than keywords. They deliberately favour questions that need the candidate's own
// history ("walk me through", "experience with", "which projects", "why this role", "your role in ...", ...);
// a false positive only means the answer leans on the resume facts a little harder, which the prompt tells the
// model to do only where they genuinely fit.
const PERSONAL_PATTERNS: RegExp[] = [
  // open invitations: tell me about..., walk me through..., take us through..., talk to me about...
  /\b(?:tell|walk|take|talk|speak)\b[^.?!]{0,24}\b(?:about|through|over)\b/i,
  /\byourself\b|\bself[- ]?intro\w*|\b(?:brief|quick|short)\s+intro\w*/i,
  // your <something about the candidate>
  /\b(?:your|ur)\s+(?:(?:most|biggest|greatest|proudest|toughest|hardest|favou?rite|best|worst|current|last|previous|past|recent|first|main|key|core|top)\s+)?(?:background|experience\w*|journey|career|resume|cv|profile|education|degree|college|university|studies|projects?|roles?|responsibilit\w+|contributions?|work|jobs?|team|manager|company|employer|achievements?|accomplishments?|challenges?|failures?|mistakes?|strengths?|weakness\w*|skills?|tech(?:nical)?\s+stack|stack|expertise|domain|speciali[sz]\w+|portfolio|github|linkedin|certifications?|motivation|interests?|goals?|aspirations?|ambitions?|salary|expectations?|notice\s+period)\b/i,
  // you + past tense: "you worked on", "you've built", "you ever led"
  /\byou(?:'ve|\s+have)?\s+(?:ever\s+|previously\s+|actually\s+|personally\s+)?(?:worked|built|led|managed|designed|implemented|developed|handled|created|used|owned|delivered|shipped|launched|migrated|deployed|optimi[sz]ed|scaled|fixed|solved|faced|dealt|learn(?:ed|t)|mentored|taught|contributed|collaborated|founded|started|joined|left|quit|studied|graduated|completed|written|tested|debugged|reviewed|maintained|architected|improved|reduced|increased|automated|done|had|been|seen)\b/i,
  // have/did/do/are you ... ever / experience / familiar / comfortable / used
  /\b(?:have|did|do|were|are|was|had|would|could)\s+you\b[^.?!]{0,40}?\b(?:ever|before|previous\w*|experience|worked|working|used|using|built|building|handled|faced|managed|led|done|familiar|comfortable|proficient|exposure|hands[- ]on)\b/i,
  // experience with X / worked with X / familiar with X / years of experience
  /\b(?:experience|exposure|worked|working|hands[- ]on|familiar|comfortable|proficien\w+)\s+(?:with|in|on|using|of)\b/i,
  /\byears?\s+of\s+experience\b/i,
  // "which projects ...", "what's the most challenging project you ...", "how many companies"
  /\b(?:what(?:'s|s)?|which|how\s+many)\s+(?:[\w']+\s+){0,4}?(?:projects?|companies|roles?|jobs?|internships?)\b[^.?!]{0,40}\b(?:you|your)\b/i,
  /\bwhat\s+have\s+you\b|\bwhat\s+(?:did|do|were|are)\s+you\s+(?:do|doing|work|working|build|building|own|owning|responsible|handle|handling|deliver)/i,
  /\bwhere\s+(?:did|do|are|were)\s+you\s+(?:study|studied|graduate|graduated|work|worked|working|live|living|from|based|located)\b/i,
  // motivation / fit: why this role, why us, why do you want to join, why are you leaving
  /\bwhy\s+(?:do\s+you\s+want|did\s+you\s+(?:choose|apply|leave|quit|switch|decide|pick|join)|are\s+you\s+(?:leaving|looking|interested|applying|switching|changing)|should\s+we|us\b|this\s+(?:role|position|job|company|team|domain|field)|our\s+(?:company|team)|(?:the\s+)?(?:role|position|company|job)\b)/i,
  /\bwhat\s+(?:interests|attracted|excites|motivates|drives|inspired|made)\s+you\b/i,
  /\bwhat\s+do\s+you\s+(?:know\s+about\s+(?:us|our|the\s+company)|want|expect|like|enjoy|look\s+for|hope|value)\b/i,
  /\bwhere\s+do\s+you\s+see\s+yourself\b|\b(?:five|5|ten|10)\s+years\b|\bcareer\s+(?:goals?|plans?|path|aspirations?)\b/i,
  // behavioral
  /\b(?:strengths?|weakness(?:es)?|achievements?|accomplishments?|proud|leadership|teamwork|disagree\w*)\b/i,
  /\b(?:a|the)\s+time\s+(?:when|you|that)\b|\bsituation\s+(?:where|when|in\s+which)\b/i,
  /\bdescribe\s+(?:a|an|the|one|your)\s+(?:\w+\s+)?(?:time|situation|project|challeng\w+|experience|instance|occasion|bug|incident|conflict|failure)\b/i,
  /\b(?:handle[d]?|resolve[d]?|deal(?:t)?\s+with|manage[d]?)\s+(?:a\s+|any\s+|the\s+)?(?:conflict|disagreement|pressure|stress|deadlines?|criticism|feedback|difficult\s+\w+)/i,
  // logistics that only the candidate can answer
  /\b(?:notice\s+period|salary|compensation|ctc|relocat\w+)\b|\bwhen\s+can\s+you\s+(?:join|start)\b/i,
];

/** Does this question need the candidate's own background (rather than pure technical knowledge)? */
export function isPersonalQuestion(text: string): boolean {
  const t = (text ?? "").replace(/\s+/g, " ");
  return PERSONAL_PATTERNS.some((re) => re.test(t));
}

// No more fixed "Code Language" / "Interview Type" settings — this app is used
// for far more than DSA coding interviews (sales, HR, behavioral, non-technical
// roles included), and forcing every candidate through a "pick your programming
// language" setting made no sense for most of them. The model now detects the
// question's own nature (technical vs personal vs coding, and — if coding —
// which language) directly from what's actually asked/shown, instead of being
// told in advance.
export function buildLiveInterviewPrompt(transcript: string, session: InterviewSession | null): string {
  const ctx = buildSessionContext(session);
  const hasFacts = hasResumeFacts(session?.profile);

  // Enhanced question detection
  const lower = transcript.toLowerCase();

  // Detect question type for better response
  const isTechnicalQuestion = [
    "how", "what", "why", "explain", "difference", "implement", "design",
    "algorithm", "complexity", "optimize", "solve", "approach", "code",
    "data structure", "pattern", "architecture", "system", "database",
    "api", "performance", "scale", "security", "test"
  ].some(kw => lower.includes(kw));

  const isPersonal = isPersonalQuestion(transcript);

  const grounding = hasFacts
    ? isPersonal
      ? "- This question is about the candidate: ground the answer in the CANDIDATE RESUME FACTS above (real projects, technologies, employers, numbers); if a detail is not there, leave it out."
      : "- If a real project or technology from the CANDIDATE RESUME FACTS genuinely fits, work it in with one short clause (\"I used this in <project>\")."
    : isPersonal
      ? "- No resume was provided: answer credibly in the first person, but do NOT invent specific employers, dates or numbers."
      : "";

  return `You are the candidate in a live interview at ${session?.companyName || "a company"} for ${session?.position || "a role"}.${ctx}

Interviewer just asked: "${transcript}"

CRITICAL INSTRUCTIONS:
1. DETECT THE QUESTION TYPE:
   - If it's a technical question (how/what/why/explain): Give a sharp, expert technical answer
   - If it's a personal question (tell me about/your experience): ${hasFacts ? "Answer in the first person from the CANDIDATE RESUME FACTS above" : "Answer in the first person, credibly and without inventing specifics"}
   - If it's a coding problem: Provide approach + complete, runnable code (not pseudocode) — infer the programming language from how the interviewer asked, the job description/context above, or the most natural/common choice for this kind of problem if nothing indicates otherwise
   - If it's not technical at all (behavioral, situational, general): answer naturally, no code or technical framing
   - If unclear: Ask for clarification professionally

2. ANSWER STRUCTURE (150-250 words max):
   - Line 1: Strong hook — show expertise immediately with a confident statement
   - Lines 2-4: Core answer with specific examples, technologies, or real experience
   - Middle: Add 2-3 bullet points if listing items, or explain with concrete examples
   - Last line: Confident closing that ties back to the role

3. QUALITY RULES:
   ${isTechnicalQuestion ? "- Give BEST technical answer: mention specific algorithms, patterns, trade-offs, real-world examples" : ""}
   ${grounding}
   - Use **bold** for key technical terms or achievements
   - Sound natural and confident, not scripted
   - Be specific: "reduced latency by 40%" not "improved performance"
   - Show depth: explain WHY, not just WHAT

4. SPEED: Generate answer FAST — prioritize clarity and impact over length

Answer now (150-250 words):`;
}

// Single adaptive prompt for Screen Analysis. It has to answer one question
// well: "what is on this screen, and does the candidate actually need an
// answer?" — so it detects first, then answers in ONE matching, deliberately
// short format. The previous version demanded a 300-500 word, six-section essay
// (Approach / Complete Solution / Key Insight / Edge Cases...) for every
// screenshot, so an MCQ or an IDE window got the same wall of text and code as a
// hard DSA problem — slow to stream and impossible to glance at mid-interview.
//
// Keep the opening "You are an expert..." — Home.tsx (isFormattedPrompt) uses it
// to tell this built prompt apart from a user-typed follow-up, so the raw prompt
// never gets saved/shown as the "question".
export function buildPrompt(session?: InterviewSession | null): string {
  const ctx = session ? buildSessionContext(session) : "";
  const hasFacts = hasResumeFacts(session?.profile);

  return `You are an expert interview assistant. The image is a screenshot of the candidate's screen during a live interview, online assessment or coding test.${ctx}

STEP 1 - READ AND DETECT (silently, before writing anything)
Read every visible word, option, constraint, example, input/output and line of code. Decide what this is and whether an answer is actually needed:
- MCQ / quiz / aptitude question
- Coding or DSA problem to solve
- Buggy code, or an error / stack trace to fix
- SQL / query / schema task
- System-design or architecture question
- Conceptual, theory, HR or behavioral question
- Code or text with no question attached (only reading material)
- Nothing actionable (IDE, chat, video call, desktop, blank page, menus)
If several questions are visible, answer each one in order, numbered.

STEP 2 - REPLY IN THE ONE MATCHING FORMAT
Line 1, always: **Detected:** <type> - <what it is, max 12 words>
Then, by type (respect the length limits - the candidate must glance at this and speak it within seconds):
- MCQ: **Answer: <option letter + text>** - one-line reason. Add a second line only if two options are close.
- Coding / DSA: the key idea and complexity in 1-3 lines, then ONE complete runnable code block in the language shown or required (infer it from starter code, the problem text or the context above; only if nothing indicates one, use Python). Comment only non-obvious lines. End with **Time O(..) - Space O(..)** on one line. No alternative approaches unless the screen asks for them.
- Bug / error: root cause in 1-2 lines, then the single best fix - only the corrected lines, not the whole file, and no alternative fixes.
- SQL: the query in one code block, then one line explaining the logic.
- System design - use EXACTLY this shape and nothing more: (a) one line of assumptions with the key numbers (max 25 words); (b) 5-6 bullets, each "Component: its role" in at most 12 words; (c) the main data flow in one line (max 25 words); (d) 2 trade-offs, one line each (max 20 words).
- Conceptual / behavioral / HR: a spoken-style answer in 3-5 sentences (60-100 words, never more than 110), first person, confident and concrete. For behavioral questions flow Situation -> Action -> Result. No headings, no code.
- Code or text with no question: 1-3 bullets on what it does / the key points. Do not write new code.
- Nothing actionable: ONE line saying what is on screen, then "No interview question visible - capture the question area or ask in Chat." Stop there. Do not invent a task and do not write code.

HARD RULES
- Use only what is actually visible. Never invent constraints, inputs or requirements. If something needed is cut off or unreadable, say exactly what is missing in one line, then answer with the most reasonable assumption stated in a few words.
- Code only when the screen calls for code. No generic tutorials, no "Key Insight", "Edge Cases", "Alternatives" or summary sections unless the screen asks for them.
- No greeting, no restating the question, no closing remarks. Use markdown sparingly (bold only for the answer or one key term).
- Write math and complexity in plain text (O(log n), n^2, 62^7) - never LaTeX or $...$ symbols.
- ${hasFacts
    ? "Use the CANDIDATE RESUME FACTS above ONLY for personal or behavioral questions (first person; real projects, technologies and numbers; nothing invented). Ignore them for MCQ, coding and other technical questions."
    : "Use the candidate profile/context above ONLY for personal or behavioral questions; ignore it for technical and coding questions."}`;
}

// ───────────────────────── chat tab and follow-ups ─────────────────────────
//
// Home.tsx used to send these two paths with NO interview context at all (chat: the raw text; follow-up: the raw
// text + a one-line style hint), so the candidate's resume was ignored there. Both builders keep the old output
// exactly when there is no session, and otherwise add the same context + resume facts the live and screen paths use.

/**
 * Prompt for a message typed into the Chat tab.
 * Home.tsx handleChatSend: `prompt: buildChatPrompt(text.trim(), interviewSession)`.
 */
export function buildChatPrompt(question: string, session: InterviewSession | null | undefined): string {
  const q = (question ?? "").trim();
  if (!session) return q;
  return `You are the AI copilot of the candidate in a live interview, and the candidate is chatting with you for help.${buildSessionContext(session)}

Candidate's message: ${q}

If the message is an interview question, reply with what the candidate can say out loud (first person, concise, grounded in the resume facts where relevant); otherwise just answer it. Keep it brief unless asked for detail or code.`;
}

const FOLLOW_UP_STYLE = "(Answer concisely, spoken-style, max 4 sentences.)";

/**
 * Prompt for a follow-up question typed under an answer.
 * Home.tsx runAIStream (the non-"formatted" follow-up branch): `prompt = buildFollowUpPrompt(followUpQuery, interviewSession)`.
 */
export function buildFollowUpPrompt(question: string, session: InterviewSession | null | undefined): string {
  const q = (question ?? "").trim();
  if (!session) return `${q}\n\n${FOLLOW_UP_STYLE}`;
  return `You are the candidate in a live interview, answering a follow-up to the conversation above.${buildSessionContext(session)}

Follow-up: ${q}

${FOLLOW_UP_STYLE}`;
}
