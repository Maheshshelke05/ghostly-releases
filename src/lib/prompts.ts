import type { InterviewSession } from "../store/useStore";

export function buildSessionContext(session: InterviewSession | null): string {
  if (!session) return "";

  let ctx = `\n\n---\nINTERVIEW CONTEXT:\n- Company: ${session.companyName}\n- Position: ${session.position}\n- Interview Language: ${session.language}`;

  if (session.description) {
    ctx += `\n- Job Description / Custom Instructions: ${session.description}`;
  }

  const p = session.profile;
  if (p) {
    ctx += `\n\nCANDIDATE PROFILE:`;
    if (p.fullName)       ctx += `\n- Name: ${p.fullName}`;
    if (p.location)       ctx += `\n- Location: ${p.location}`;
    if (p.summary)        ctx += `\n- Summary: ${p.summary.slice(0, 600)}`;
    if (p.skills)         ctx += `\n- Skills: ${p.skills.slice(0, 600)}`;
    if (p.experience)     ctx += `\n- Experience:\n${p.experience.slice(0, 1200)}`;
    if (p.projects)       ctx += `\n- Projects:\n${p.projects.slice(0, 1200)}`;
    if (p.education)      ctx += `\n- Education: ${p.education.slice(0, 300)}`;
    if (p.certifications) ctx += `\n- Certifications: ${p.certifications.slice(0, 300)}`;
    if (p.github)         ctx += `\n- GitHub: ${p.github}`;
    if (p.linkedin)       ctx += `\n- LinkedIn: ${p.linkedin}`;
  }

  ctx += "\n---\n\nIMPORTANT: Use the candidate profile above to give personalized, first-person answers. Reference their actual projects, skills, and experience when answering. Speak as if YOU are the candidate.";
  return ctx;
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
  const p = session?.profile;

  // Enhanced question detection
  const lower = transcript.toLowerCase();

  // Detect question type for better response
  const isTechnicalQuestion = [
    "how", "what", "why", "explain", "difference", "implement", "design",
    "algorithm", "complexity", "optimize", "solve", "approach", "code",
    "data structure", "pattern", "architecture", "system", "database",
    "api", "performance", "scale", "security", "test"
  ].some(kw => lower.includes(kw));

  const isPersonal = [
    "tell me about yourself", "introduce yourself", "your background",
    "your experience", "you worked", "you built", "your project", "your role",
    "you handled", "you managed", "you led", "you designed", "you implemented",
    "strength", "weakness", "challenge", "achievement", "proud", "difficult",
    "why should we", "why do you want", "where do you see", "career goal",
    "previous company", "last job", "current role", "past experience",
    "what have you done", "have you ever", "did you ever", "your skill",
  ].some(kw => lower.includes(kw));

  const profileSection = isPersonal && p ? `

USE THIS PROFILE TO ANSWER (speak in first person as the candidate):
- Name: ${p.fullName || "the candidate"}
- Skills: ${p.skills || "not provided"}
- Experience: ${p.experience || "not provided"}
- Projects: ${p.projects || "not provided"}
- Education: ${p.education || "not provided"}
${p.certifications ? `- Certifications: ${p.certifications}` : ""}

This is a PERSONAL question — answer using the candidate's ACTUAL background above. Be specific, use real project names, real technologies, real numbers if available.` : "";

  return `You are the candidate in a live interview at ${session?.companyName || "a company"} for ${session?.position || "a role"}.${ctx}${profileSection}

Interviewer just asked: "${transcript}"

CRITICAL INSTRUCTIONS:
1. DETECT THE QUESTION TYPE:
   - If it's a technical question (how/what/why/explain): Give a sharp, expert technical answer
   - If it's a personal question (tell me about/your experience): Use the candidate profile above
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
   ${isPersonal ? "- Reference REAL projects, skills, numbers from profile above" : ""}
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
- Use the candidate profile/context above ONLY for personal or behavioral questions; ignore it for technical and coding questions.`;
}
