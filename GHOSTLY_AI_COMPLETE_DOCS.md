# 👻 Ghostly AI — Complete Product Documentation

> **Version 1.1.6** | Stealth AI Copilot for Technical Interviews
> Built with Electron + React + TypeScript

---

## 🧠 What is Ghostly AI?

Ghostly AI is an **invisible desktop assistant** that sits on top of every app on your screen during technical interviews. It listens to the interviewer's voice in real-time, reads your screen, and gives you instant AI-powered answers — all without the interviewer ever knowing it's there.

It works on **Zoom, Google Meet, Microsoft Teams, and any video call platform** because it captures system audio directly, not microphone input.

---

## 🚀 Core Features — Full Details

---

### 1. 🎙️ AI Answer (Live Transcription Mode)

**What it does:**
Captures all system audio (interviewer's voice from Zoom/Meet/Teams) in real-time, converts speech to text using Deepgram's Nova-2 model, and automatically sends the question to AI for an answer.

**How it works:**
1. Click "AI Answer" tab → app asks you to share your screen (required by browser API)
2. System audio is captured via Windows audio loopback — captures ALL app sounds
3. Audio is streamed to Deepgram WebSocket in real-time (16kHz, linear16 encoding)
4. Deepgram returns transcript with `interim_results` — you see text appearing live in the top bar
5. After 2.5 seconds of silence → Auto AI triggers and sends transcript to your chosen AI provider
6. Answer streams back word-by-word with a blinking cursor animation

**Auto AI vs Manual Send:**
- **Auto AI ON** → After 2.5s silence, automatically sends to AI (hands-free)
- **Auto AI OFF** → You manually click "Send" button or press `Ctrl+0`
- Toggle Auto AI from the green pill button in the top bar during live mode

**Smart Question Extraction:**
The AI prompt intelligently detects if the question is personal ("tell me about yourself") vs technical, and adjusts the answer style accordingly.

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `Ctrl+0` | Send current transcript to AI manually |
| `Ctrl+N` | Save current Q&A, start listening for next question |

---

### 2. 🖥️ Screen Analysis (Screenshot + AI Solve)

**What it does:**
Takes a screenshot of your entire screen, sends it to AI with vision capability, and returns a complete solution — code, explanation, complexity analysis, dry run, edge cases.

**How it works:**
1. Click "Screen" tab OR press `Ctrl+E`
2. App briefly hides itself (opacity → 0) so it doesn't appear in screenshot
3. Captures full screen using Electron's `desktopCapturer`
4. App reappears, screenshot sent to AI with a detailed prompt
5. AI analyzes the problem and returns structured solution

**What the AI returns for DSA problems:**
- Problem Understanding
- Approach (why this algorithm)
- Complete working code with inline comments
- Time & Space Complexity with explanation
- Key Insight
- Step-by-Step Dry Run with actual values
- Edge Cases (4-5 minimum)
- Alternative Approaches

**Interview Types supported:**
| Type | What AI focuses on |
|------|-------------------|
| **DSA** | Algorithms, data structures, brute force → optimal, dry runs |
| **System Design** | Architecture, capacity estimation, API design, DB schema, scaling |
| **Frontend** | React/TypeScript, hooks, accessibility, state management |
| **SQL** | CTEs, JOINs, window functions, index optimization |
| **Behavioral** | STAR method, quantified results, first-person answers |

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `Ctrl+E` | Take screenshot + send to AI |
| `Ctrl+Enter` | Send existing screenshot to AI |
| `Ctrl+Shift+Enter` | Screenshot + Solve in one step |

---

### 3. 💬 AI Chat

**What it does:**
A persistent chat interface where you can ask anything — coding questions, concept explanations, follow-up questions, interview prep — without taking a screenshot.

**How it works:**
- Type your question in the input box at the bottom
- Maintains last 8 messages as context (conversation memory)
- Streams response word-by-word
- Uses your active AI provider and model

**Best for:**
- "Explain this concept in simple terms"
- "What's the difference between X and Y?"
- "Give me a follow-up question for this topic"
- "Review my answer and improve it"

---

### 4. 👤 Candidate Profile (Deep Personalization)

**What it does:**
You fill in your real resume data once — name, skills, experience, projects, education. The AI then speaks **as you** in first person, referencing your actual background.

**Fields you can fill:**
- Full Name, Location, Email, Phone
- Professional Summary
- Skills (comma separated)
- Work Experience (role, company, years, achievements)
- Projects (name, tech stack, impact)
- Education (degree, college, year)
- Certifications
- GitHub & LinkedIn URLs

**How it's used:**
When the interviewer asks "Tell me about yourself" or "What projects have you worked on?", the AI uses your actual profile to give a personalized, authentic answer that sounds like YOU — not a generic response.

**Profile is saved permanently** — fill it once, use it in every interview session.

---

### 5. 🎯 Interview Session Setup

**What it does:**
Before each interview, you set the context so AI gives company-specific, role-specific answers.

**Setup fields:**
- **Company Name** — e.g., "Google", "Amazon", "TCS"
- **Position** — e.g., "Senior Software Engineer", "Data Scientist"
- **Language** — English, Hindi, Marathi, Spanish, French, German, Japanese, Chinese
- **Auto AI** — Enable/disable automatic answering
- **Custom Instructions** — e.g., "Always write code in Python. Keep answers under 3 minutes."

**How it affects AI:**
The company name and position are injected into every AI prompt. The AI knows it's answering for a Google SWE interview vs a TCS fresher interview and adjusts accordingly.

---

### 6. 📋 Interview History

**What it does:**
Every completed interview session is saved with full details — all Q&A pairs, duration, features used, company, position.

**What's saved per session:**
- Company Name + Position
- Date & Time
- Duration (how long the session lasted)
- Features Used (AI Answer, Screen, Chat)
- Complete Q&A History — every question asked + every AI answer
- AI Provider & Model used

**How to access:**
Click "Last Interviews" on the home screen → see all sessions → click any session for full details → expand any Q&A pair to see full question + answer → copy any answer.

**Management:**
- Delete individual sessions
- Clear all history
- Each session shows Q&A count

---

### 7. 🛡️ Stealth Mode (Screen Invisible)

**What it does:**
Makes Ghostly AI completely invisible to screen sharing, recording software, and OBS. The interviewer cannot see the app even if they ask you to share your screen.

**How it works (Technical):**
- Uses Electron's `setContentProtection(true)` on Windows/Mac
- Sets `affinity` and `skipTaskbar` flags
- Window is excluded from screen capture APIs
- `alwaysOnTop: true` with `screen-saver` level — floats above everything
- Transparent background — blends with desktop

**Show/Hide:**
- `Ctrl+B` — instantly toggle visibility (opacity 0 ↔ 1)
- When hidden: completely click-through, no interaction possible
- When shown: fully interactive

---

### 8. 🔧 Settings & Customization

**Window Opacity:**
Slider from 20% to 100% — make the app semi-transparent so it blends with your background during interviews.

**API Key Management:**
Add/update/remove API keys for any provider directly from the settings panel during an interview — no need to restart.

**OpenRouter Model Picker:**
If using OpenRouter, select from 10 free models directly in settings.

**Keyboard Shortcuts Reference:**
| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Show / Hide app |
| `Ctrl+E` | Screenshot + Analyze |
| `Ctrl+Enter` | Ask AI (solve current screenshot) |
| `Ctrl+0` | Send live transcript to AI |
| `Ctrl+N` | Next question (save current, clear screen) |
| `Ctrl+G` | Start Over (clear session) |
| `Ctrl+↑↓←→` | Move window position |
| `Ctrl+8` | Scroll answer up |
| `Ctrl+2` | Scroll answer down |

---

### 9. 🔄 Auto Updater

**What it does:**
Automatically checks for new versions on startup. Shows a download banner when update is available. Downloads in background, installs on restart.

**How it works:**
- Checks GitHub releases 3 seconds after app launch
- Shows "Update Available" banner with version number
- Click "Download" → progress bar shows download %
- Click "Restart & Install" → app restarts with new version

---

## 🤖 AI Providers — Complete Guide

---

### Provider Comparison Table

| Provider | Free Tier | Speed | Vision | Best For |
|----------|-----------|-------|--------|----------|
| **Gemini** | ✅ Yes (generous) | ⚡⚡⚡ Fast | ✅ Yes | **Best overall — recommended** |
| **Groq** | ✅ Yes (rate limited) | ⚡⚡⚡⚡ Fastest | ✅ Llama Scout | Live transcription answers |
| **OpenRouter** | ✅ Yes (10 free models) | ⚡⚡ Medium | Partial | Free usage, variety |
| **OpenAI** | ❌ Paid only | ⚡⚡⚡ Fast | ✅ Yes | Best quality answers |
| **Anthropic** | ❌ Paid only | ⚡⚡ Medium | ✅ Yes | Long, detailed answers |
| **Grok (xAI)** | ✅ Limited free | ⚡⚡⚡ Fast | ✅ Yes | Latest knowledge |
| **Ollama** | ✅ 100% Free (local) | Depends on PC | ✅ Some | Privacy, offline use |
| **Gemma** | ✅ Yes | ⚡⚡ Medium | ❌ No | Lightweight tasks |

---

### 🟢 FREE Providers — Detailed

---

#### 1. Google Gemini ⭐ RECOMMENDED
**Get key:** https://aistudio.google.com/app/apikey

**Free tier:** 15 requests/minute, 1 million tokens/day — very generous

**Models available:**
| Model | Speed | Quality | Vision |
|-------|-------|---------|--------|
| `gemini-2.0-flash` | ⚡⚡⚡⚡ | ⭐⭐⭐⭐⭐ | ✅ |
| `gemini-1.5-flash` | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | ✅ |
| `gemini-1.5-pro` | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | ✅ |

**Why it's the best:**
- Fastest response time for screen analysis
- Excellent code quality
- Handles screenshots perfectly (vision model)
- Free tier is more than enough for interviews
- `gemini-2.0-flash` is the sweet spot — fast + smart

**Best use:** Screen Analysis (DSA, System Design, Frontend, SQL)

---

#### 2. Groq ⚡ FASTEST
**Get key:** https://console.groq.com/keys

**Free tier:** 14,400 requests/day, 30 requests/minute

**Models available:**
| Model | Speed | Quality | Vision |
|-------|-------|---------|--------|
| `llama-3.3-70b-versatile` | ⚡⚡⚡⚡⚡ | ⭐⭐⭐⭐⭐ | ❌ |
| `llama-4-scout-17b` | ⚡⚡⚡⚡⚡ | ⭐⭐⭐⭐ | ✅ |
| `mixtral-8x7b-32768` | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | ❌ |
| `gemma2-9b-it` | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ | ❌ |

**Why it's great:**
- Literally the fastest AI inference in the world (custom hardware)
- `llama-3.3-70b-versatile` gives GPT-4 level answers at lightning speed
- Perfect for Live Transcription — answer appears before interviewer finishes talking
- Ghostly AI **automatically uses Groq** for live transcription if you have a Groq key

**Best use:** Live AI Answer (transcription mode) — auto-selected by app

---

#### 3. OpenRouter (10 Free Models)
**Get key:** https://openrouter.ai/keys

**Free tier:** Varies per model, generally 20-200 requests/day per model

**Free models available:**
| Model | Quality | Speed | Best For |
|-------|---------|-------|----------|
| `DeepSeek R1` | ⭐⭐⭐⭐⭐ | ⚡⚡ | Complex reasoning, math |
| `Llama 3.3 70B` | ⭐⭐⭐⭐⭐ | ⚡⚡⚡ | General coding |
| `Qwen 2.5 72B` | ⭐⭐⭐⭐ | ⚡⚡⚡ | Multilingual, coding |
| `Nemotron 70B` | ⭐⭐⭐⭐ | ⚡⚡ | High performance |
| `Gemini 2.0 Flash` | ⭐⭐⭐⭐⭐ | ⚡⚡⚡⚡ | Fast + smart |
| `Gemini 1.5 Flash` | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ | Fast |
| `Mistral 7B` | ⭐⭐⭐ | ⚡⚡⚡⚡ | Quick answers |
| `Llama 3.1 8B` | ⭐⭐⭐ | ⚡⚡⚡⚡⚡ | Lightweight |
| `Phi-4` | ⭐⭐⭐⭐ | ⚡⚡⚡ | Compact, efficient |
| `Auto (Best)` | ⭐⭐⭐⭐⭐ | ⚡⚡⚡ | OpenRouter picks best |

**Best use:** Backup when Gemini/Groq rate limits hit. DeepSeek R1 for hard algorithm problems.

---

#### 4. Ollama (100% Free, Local)
**Download:** https://ollama.com/download

**Free tier:** Completely free — runs on your own computer, no API calls

**Models:**
- `llama3.2`, `llama3.1`, `codellama`, `mistral`, `deepseek-coder`

**Setup:** Install Ollama → `ollama pull llama3.2` → enter `http://localhost:11434` as the "key"

**Why use it:**
- Zero cost, unlimited usage
- Complete privacy — nothing leaves your computer
- Works offline

**Limitation:** Speed depends on your GPU/CPU. Needs 8GB+ RAM minimum.

**Best use:** Privacy-conscious users, offline use, unlimited practice sessions

---

#### 5. Grok (xAI) — Limited Free
**Get key:** https://console.x.ai/

**Free tier:** Limited monthly credits

**Models:** `grok-2-vision-1212`, `grok-2-1212`

**Why use it:** Latest training data, good at current events and recent tech

---

### 💰 Paid Providers

#### OpenAI
**Get key:** https://platform.openai.com/api-keys
**Models:** `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`
**Best for:** Highest quality answers, best code generation
**Cost:** ~$0.01-0.03 per interview session with gpt-4o-mini

#### Anthropic (Claude)
**Get key:** https://console.anthropic.com/settings/keys
**Models:** `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`
**Best for:** Long detailed explanations, behavioral questions, system design
**Cost:** ~$0.01-0.05 per interview session

---

## 🏆 Best Provider Recommendations

### For Beginners (Zero Cost Setup):
1. **Gemini** (primary) — get free key in 2 minutes
2. **Groq** (for live transcription) — get free key in 2 minutes
3. **OpenRouter** (backup) — 10 free models

### For Best Quality (Paid):
1. **OpenAI GPT-4o** — best code quality
2. **Anthropic Claude 3.5 Sonnet** — best explanations

### For Privacy:
1. **Ollama** — 100% local, zero data sent anywhere

### Optimal Free Setup (Recommended):
```
Deepgram key → for voice transcription
Gemini key   → for screen analysis (DSA, System Design)
Groq key     → auto-used for live transcription answers
OpenRouter   → backup with 10 free models
```

---

## 📱 How a Complete Interview Session Works

```
1. SETUP (30 seconds)
   └── Enter Company: "Amazon"
   └── Position: "SDE-2"
   └── Language: English
   └── Fill profile (once, saved forever)

2. API SETUP
   └── Add Deepgram key (voice)
   └── Add Gemini key (AI)
   └── Select model: gemini-2.0-flash

3. AUDIO TEST
   └── Test microphone
   └── Verify system audio capture

4. INTERVIEW STARTS
   └── Press Ctrl+B to hide app
   └── Join Zoom/Meet call

5. DURING INTERVIEW
   ├── Interviewer asks coding question
   │   └── Press Ctrl+E → screenshot → AI solves it
   │   └── See: Problem Understanding, Code, Complexity, Dry Run
   │
   ├── Interviewer asks verbal question
   │   └── Click "AI Answer" → mic icon appears
   │   └── Interviewer speaks → transcript appears in top bar
   │   └── After 2.5s silence → AI answers automatically
   │   └── Read the answer naturally
   │
   └── Follow-up questions
       └── Type in bottom input box → AI answers in context

6. SESSION ENDS
   └── Click "End" button
   └── Full session saved to history
   └── Review all Q&A in "Last Interviews"
```

---

## 🔑 Quick Start — Get Running in 5 Minutes

### Step 1: Get Free API Keys (2 min)
1. **Deepgram** → https://console.deepgram.com/signup → free $200 credit
2. **Gemini** → https://aistudio.google.com/app/apikey → completely free
3. **Groq** → https://console.groq.com/keys → completely free

### Step 2: Install & Run
```bash
npm install
npm run dev
```

### Step 3: Setup in App
1. Click "Start Interview"
2. Fill Company + Position
3. Add your API keys
4. Test audio
5. You're ready!

---

## 💡 Pro Tips

1. **Use Groq for live mode** — it's 10x faster than other providers, answers appear instantly
2. **Use Gemini for screen analysis** — best vision model, handles complex DSA screenshots perfectly
3. **Fill your profile completely** — the more detail you add, the more personalized and authentic the answers sound
4. **Set Custom Instructions** — "Always write Python code. Keep answers under 2 minutes. Use simple language." — this shapes every answer
5. **Use Ctrl+N between questions** — saves current Q&A and clears screen for next question without stopping audio
6. **Opacity slider** — set to 70-80% during interview so it's semi-transparent and less obvious if someone walks by
7. **Practice mode** — use it for mock interviews before the real one to get comfortable with the workflow

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Electron 28 |
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite + electron-vite |
| Styling | TailwindCSS |
| Animations | Framer Motion |
| State Management | Zustand |
| Voice Transcription | Deepgram Nova-2 (WebSocket) |
| Audio Capture | Web Audio API + AudioWorklet |
| Screen Capture | Electron desktopCapturer |
| Data Storage | electron-store (encrypted) |
| Auto Updates | electron-updater (GitHub Releases) |

---

## 📊 Feature Summary Table

| Feature | Free | Requires Key | Works Offline |
|---------|------|-------------|---------------|
| Screen Analysis | ✅ | AI key | ❌ |
| Live Transcription | ✅ | Deepgram + AI key | ❌ |
| AI Chat | ✅ | AI key | ❌ (Ollama: ✅) |
| Candidate Profile | ✅ | None | ✅ |
| Interview History | ✅ | None | ✅ |
| Stealth Mode | ✅ | None | ✅ |
| Auto Updates | ✅ | None | ❌ |
| Ollama (Local AI) | ✅ | None | ✅ |

---

*Ghostly AI — Built by Mahesh Shelke | Open Source | v1.1.6*
