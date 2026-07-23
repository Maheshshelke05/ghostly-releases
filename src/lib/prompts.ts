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

  return `You are the candidate in a live technical interview at ${session?.companyName || "a company"} for ${session?.position || "a role"}.${ctx}${profileSection}

Interviewer just asked: "${transcript}"

CRITICAL INSTRUCTIONS:
1. DETECT THE QUESTION TYPE:
   - If it's a technical question (how/what/why/explain): Give a sharp, expert technical answer
   - If it's a personal question (tell me about/your experience): Use the candidate profile above
   - If it's a coding problem: Provide approach + pseudocode
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

export function buildPrompt(type: string, language: string, session?: InterviewSession | null): string {
  const ctx = session ? buildSessionContext(session) : "";

  const base = `You are an expert ${language} developer in a technical interview.${ctx}

Carefully analyze the ENTIRE problem shown in the screenshot — read every line, every constraint, every example.

IMPORTANT: Provide comprehensive, detailed explanations (300-500 words for text sections). The first 3-4 lines of explanation must demonstrate exceptional expertise. Be thorough and impressive. Provide complete, well-commented code.

Respond EXACTLY in this format:

## Problem Understanding
[Restate the problem in your own words in detail — what is given, what is asked, what are the constraints]
[List all constraints: input size, value ranges, time/space limits if mentioned]
[Explain what makes this problem challenging or interesting]

## Approach
[3-5 sentences explaining your overall strategy and WHY you chose this approach]
[Mention what you considered and rejected — brute force, naive approach, etc.]
[Explain the key insight or observation that leads to the optimal solution]
[Describe the data structures you'll use and why they're appropriate]

## Solution
\`\`\`${language}
# ── Step 1: [describe what this block does] ──────────────────────────────
# [explain the key data structure or algorithm choice and WHY]
# [explain the intuition behind this approach]

# ── Step 2: [describe what this block does] ──────────────────────────────
# [explain edge cases handled here]
# [explain why this step is necessary]

# ── Step 3: [describe what this block does] ──────────────────────────────
# [explain the core logic in detail]
# [explain how this achieves the goal]

[COMPLETE working code — NO truncation — every non-obvious line MUST have an inline comment]
[Variable names must be descriptive — no single letters except loop counters]
[Add comments explaining the logic flow, not just what the code does]
\`\`\`

## Complexity Analysis
- **Time:** O(?) — [explain step by step in detail why: what loop runs how many times, what operations happen, etc.]
- **Space:** O(?) — [explain in detail what extra memory is used, why it's needed, and how it scales]

## Key Insight
[2-3 sentences on the core trick or observation that makes this solution work]
[Explain why this insight is important and how it improves the solution]

## Step-by-Step Dry Run
[Walk through the FIRST example from the problem with actual values in detail]
[Show the state of ALL key variables at each step]
[Format: Step 1: input=[...], variable=value, explanation → Step 2: ...]
[Make this detailed enough that someone can follow along easily]

## Edge Cases Handled
- [Edge case 1]: [how your code handles it and why this approach works]
- [Edge case 2]: [how your code handles it and why this approach works]
- [Edge case 3]: [how your code handles it and why this approach works]
- [Edge case 4]: [how your code handles it and why this approach works]
[List at least 4-5 edge cases: empty input, single element, duplicates, max values, negative numbers, etc.]

## Alternative Approaches
[Mention 2-3 other valid approaches with detailed explanation]
[For each: explain the approach, time/space complexity, and trade-offs]
[Explain why you chose your approach over these alternatives]
`;

  const variants: Record<string, string> = {
    dsa: `${base}

Additional rules for DSA:
- If brute force → optimized progression exists, show BOTH solutions with detailed complexity comparison.
- For the optimized solution: explain the key insight that reduces complexity in comprehensive detail.
- Comment every loop invariant, every pointer movement, every hash map lookup with thorough explanations.
- For graph/tree problems: draw the traversal order in comments and explain the strategy in depth.
- For DP problems: clearly define the dp array meaning, recurrence relation, and base cases with detailed examples.
- Show at least TWO complete example dry runs with actual values step by step.
- Explain the intuition behind the solution before diving into code with exceptional clarity.
- Make your explanation detailed, thorough, and highly impressive - demonstrate mastery of the topic.
- Provide comprehensive coverage of all aspects, edge cases, optimizations, and trade-offs.`,

    system_design: `You are a staff engineer in a system design interview.${ctx}
Analyze the system design problem in the screenshot and provide a COMPLETE design.

## Requirements Clarification
**Functional Requirements:**
- [List 5-7 core features the system must support]

**Non-Functional Requirements:**
- Scale: [estimated users, requests/sec, data volume]
- Latency: [acceptable response times]
- Availability: [uptime requirement, e.g., 99.99%]
- Consistency: [strong vs eventual consistency needs]

## Capacity Estimation
- Daily Active Users: [estimate]
- Requests per second: [read QPS, write QPS]
- Storage per day: [calculate with assumptions]
- Bandwidth: [inbound + outbound]

## High-Level Architecture
\`\`\`
[Draw ASCII diagram showing ALL components]
[Client] → [Load Balancer] → [API Servers] → [Cache] → [Database]
                                           ↓
                                    [Message Queue] → [Workers]
                                           ↓
                                    [Object Storage]
\`\`\`

## API Design
[List 5-8 key endpoints]
- POST /api/v1/[resource] — [description] — Request: {...} Response: {...}
- GET  /api/v1/[resource]/:id — [description]
- [etc.]

## Database Schema
\`\`\`sql
-- [Table 1 name] — [purpose]
CREATE TABLE [name] (
  id          BIGINT PRIMARY KEY,
  [field]     [TYPE] NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  INDEX idx_[field] ([field])
);
\`\`\`

## Detailed Component Design
**[Component 1]:** [What it does, why it exists, how it scales]
**[Component 2]:** [What it does, why it exists, how it scales]
[Cover each major component]

## Caching Strategy
- **What to cache:** [specific data]
- **Cache layer:** Redis/Memcached — [why]
- **Eviction policy:** LRU/LFU — [why]
- **TTL:** [value and reasoning]
- **Cache invalidation:** [strategy]

## Scaling Strategy
- **Horizontal scaling:** [which components, how]
- **Database sharding:** [sharding key, strategy]
- **CDN:** [what content, which regions]
- **Read replicas:** [for which queries]

## Fault Tolerance & Reliability
- **Single points of failure:** [identified and mitigated how]
- **Replication:** [strategy for each data store]
- **Circuit breakers:** [where and why]
- **Graceful degradation:** [what happens when components fail]

## Key Trade-offs
1. [Decision 1]: Chose [X] over [Y] because [reason] — trade-off: [downside]
2. [Decision 2]: Chose [X] over [Y] because [reason] — trade-off: [downside]
3. [Decision 3]: Chose [X] over [Y] because [reason] — trade-off: [downside]`,

    frontend: `${base}

Additional rules for Frontend:
- Write production-ready React with TypeScript — no any types, no shortcuts.
- Add JSDoc comments above every component explaining props and behavior.
- Comment every useEffect explaining what it does and why the dependencies are correct.
- Comment every custom hook explaining its purpose and return values.
- Include proper TypeScript interfaces for ALL props and state.
- Handle ALL states: loading, error, empty, success.
- Include accessibility: aria-label, role, keyboard navigation where relevant.
- For complex state: explain why you chose useState vs useReducer vs external store.`,

    sql: `${base}

Additional rules for SQL:
- Add a comment block at the top explaining the overall query logic in plain English.
- Comment each CTE explaining: what it computes, why it's needed, what it returns.
- Comment each JOIN: what tables are joined, on what condition, why this join type (INNER/LEFT/etc.).
- Comment each WHERE/HAVING clause: what it filters and why.
- Comment each window function: what it computes over what partition/order.
- Show the expected output for the given example data.
- Mention which indexes would make this query faster and why.
- If multiple approaches exist (subquery vs CTE vs JOIN), explain the trade-offs.`,

    behavioral: `Analyze the behavioral interview question in the screenshot.${ctx}
Structure your response using the STAR method with DETAILED explanations:

## Situation
[Set the SPECIFIC context in detail — company name (or type), team size, your role, timeline, what was at stake]
[Be concrete: "At a 50-person startup" not "At a company"]
[Provide enough context so the interviewer understands the full picture]
[2-3 sentences minimum]

## Task
[YOUR specific responsibility — what YOU were accountable for, not the team]
[Clarify: what success looked like, what the constraints were, what challenges you faced]
[Explain why this task was important or challenging]
[2-3 sentences minimum]

## Action
[Detail the EXACT steps YOU took — use "I" not "we" throughout]
[Include at least 6-8 specific actions with explanations:]
1. First, I [analyzed/identified/decided] ... [explain why this was important]
2. Then I [built/implemented/communicated] ... [explain the approach]
3. I also [handled/resolved/escalated] ... [explain the reasoning]
4. To address [challenge], I [specific action] ... [explain the outcome]
5. Additionally, I [action] ... [explain why this mattered]
6. I then [action] ... [explain the impact]
7. To ensure [goal], I [action] ... [explain the benefit]
8. Finally, I [delivered/presented/measured] ... [explain the result]
[Make this section detailed and comprehensive]

## Result
[Quantify the impact with REAL metrics and detailed outcomes:]
- [Metric 1]: improved by X% / reduced by Y hours / saved $Z [explain what this meant for the business]
- [Metric 2]: [another measurable outcome with context]
- [Metric 3]: [additional impact with explanation]
[What you learned from this experience in detail]
[How it changed your approach going forward with specific examples]
[What feedback you received from stakeholders]

IMPORTANT: Make the total response extremely impactful but SHORT. Strictly 100-150 words (max 200 words).
The first 3-4 lines MUST hook the interviewer and show immense expertise immediately.
Make it sound natural and conversational. Use the candidate's actual experience.`,

    general: `You are a helpful AI coding assistant and expert.${ctx}
Carefully analyze ALL content visible in the screenshot.

CRITICAL: DETECT what is shown in the screenshot:
- Is it CODE? (detect language, purpose, bugs, improvements)
- Is it a PROBLEM/QUESTION? (detect type: DSA, system design, SQL, concept)
- Is it an ERROR/BUG? (detect error type, root cause, fix)
- Is it DOCUMENTATION/TEXT? (summarize key points)
- Is it a DIAGRAM/ARCHITECTURE? (explain components, flow)

Provide a COMPREHENSIVE, DETAILED answer with exceptional depth (300-500 words):

## What I Detected
[Precisely identify: "This is a [type] showing [what]"]
[Language/framework if code, problem type if question, error type if bug]
[Key elements visible: function names, class names, error messages, constraints]

## Analysis
${""}
**If CODE:**
- Purpose: [what this code does]
- Language/Framework: [detected]
- Issues Found: [bugs, anti-patterns, performance issues]
- Quality: [readability, maintainability, best practices]

**If PROBLEM/QUESTION:**
- Problem Type: [DSA/System Design/SQL/Concept/etc.]
- Core Challenge: [what makes this hard]
- Constraints: [input size, time limits, requirements]
- Expected Output: [what the solution should produce]

**If ERROR/BUG:**
- Error Type: [syntax/runtime/logical/compilation]
- Root Cause: [exact reason for the error]
- Affected Line(s): [which lines have the issue]
- Impact: [what breaks because of this]

## Complete Solution
[Provide the FULL, PERFECT answer based on what was detected]
[If code: write corrected/improved version with detailed comments]
[If problem: provide optimal solution with approach explanation]
[If error: show the exact fix with before/after comparison]
[If concept: explain thoroughly with examples]

## Code Solution (if applicable)
\`\`\`
[COMPLETE working code with comprehensive inline comments]
[Every important line explained]
[Handle all edge cases]
[Follow best practices for the detected language]
\`\`\`

## Step-by-Step Explanation
1. [First key point with comprehensive explanation and WHY it matters]
2. [Second key point with comprehensive explanation and impact]
3. [Third key point with comprehensive explanation and reasoning]
4. [Fourth key point with comprehensive explanation]
[Continue for all important aspects]

## Key Technical Details
- **[Aspect 1]:** [Detailed explanation with examples]
- **[Aspect 2]:** [Detailed explanation with reasoning]
- **[Aspect 3]:** [Detailed explanation with trade-offs]
- **[Aspect 4]:** [Detailed explanation with best practices]

## Common Mistakes & How to Avoid
- **Mistake 1:** [What it is] → [Why it's wrong] → [Correct approach]
- **Mistake 2:** [What it is] → [Why it's wrong] → [Correct approach]
- **Mistake 3:** [What it is] → [Why it's wrong] → [Correct approach]

## Optimization & Best Practices
- [Optimization 1 with detailed reasoning and impact]
- [Best practice 1 with explanation of benefits]
- [Performance tip with benchmarks or complexity analysis]
- [Security consideration if applicable]

## Related Concepts
- [Related concept 1 and how it connects]
- [Related concept 2 and when to use it]
- [Alternative approach and trade-offs]

Format your response cleanly using markdown with proper headers and code blocks. Be thorough, impressive, and demonstrate exceptional expertise. DETECT accurately and provide the PERFECT solution.`,
  };

  return variants[type] ?? base;
}
