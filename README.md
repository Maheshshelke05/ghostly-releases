# 👻 Ghostly AI v3.3.5 — Stealth Technical Interview Assistant

Ghostly AI is an ultra-fast, stealthy AI assistant engineered specifically for live technical interviews, DSA coding rounds, and system design evaluations. It operates discreetly on your screen, featuring real-time audio transcription, instant screen capture analysis, and deep resume context injection.

---

## 🐛 What's Fixed in Version 3.3.5

A bug-fix release addressing real user reports from v3.3.3/v3.3.4:

- **"Model does not exist" / "API keys not working":** Groq's `meta-llama/llama-4-scout-17b-16e-instruct` model was removed from Groq's catalog entirely and errored for every user who had it selected (it was also the **default** Groq model, so this hit new users immediately). Removed it, replaced the default with `llama-3.3-70b-versatile`, and added `openai/gpt-oss-120b`/`20b` as additional free Groq options. If a screenshot is sent while Groq is active (which has no vision model at all now), the app tells the model to ask you to describe the screen instead of erroring or silently ignoring the image.
- **Overlay briefly visible in Google Meet screen share after re-enabling audio:** Every audio (re)start called `getDisplayMedia()` fresh, which removed the window's capture-exclusion flag, re-enumerated screens, and reapplied it ~800ms later — visible in an *already active* screen share for that window. The resolved screen source is now cached after the first successful call, so re-enabling audio mid-interview no longer touches stealth mode at all.
- **"Microphone is not working" with no explanation:** The Audio Setup mic test only ever showed a bare "No Signal ✗" on failure. It now detects the actual cause (OS-level mic permission blocked, no device found, or the mic already in use by another app) and shows a specific, actionable message for each.

---

## 🚀 What's New in Version 3.3.4

Version 3.3.4 is a major performance, reliability, and UX update focused on sub-second AI speed, zero UI freezes, intelligent audio silence detection, and 100% real API verification.

### ⚡ Performance & Speed Optimizations
- **800px HTML5 Canvas Image Compression (3x-5x Faster Screen Analysis):**
  Full-resolution 4K/1080p screenshots are automatically downscaled to 800px width @ 70% JPEG quality before sending to Vision AI APIs. Reduces payload size from ~4MB to **~40KB**, delivering answers in **under 1 second**.
- **50ms Streaming State Throttle (Zero App Freeze):**
  Throttles React state updates during high-speed AI streaming (Groq @ ~500 tokens/sec) to a steady 20 FPS (every 50ms). Reduces CPU load by **95%**, keeping the app 100% responsive for mouse clicks, window drag, and hotkeys.
- **100% Real End-to-End API Key Verification:**
  Replaced dummy ping checks in `ApiSetupPage` with 100% real live endpoint tests:
  - **Deepgram:** Sends a silent WAV buffer to `/v1/listen` (Nova-2 model).
  - **Gemini:** Sends a 1-part test completion to `generateContent`.
  - **Groq / OpenRouter / NVIDIA:** Sends a 1-token test chat completion.

### 🎙️ Live Audio & Smart Silence Features
- **Auto QA History Pages (Zero Data Loss):**
  When a new question is detected in live mode, the previous Q&A is **automatically saved to QA History Pages (`Q1`, `Q2`, `Q3`...)**. Answers are **never overwritten or lost**.
- **Short-Filler Interjection Filter:**
  Phrases shorter than 4 words (e.g. *"yeah"*, *"okay"*, *"right"*, *"got it"*) without a question mark (`?`) are **automatically ignored**, preventing background filler noise from cluttering your screen.
- **Natural Silence Pacing (2.2s Delay):**
  Updated default silence detection to **2.2 seconds (2200ms)** for realistic interview flow, with instant **800ms trigger** when a question mark (`?`) is detected.
- **Real-Time Tech Keyword Highlighting:**
  Technical terms (`Array`, `PostgreSQL`, `React`, `Python`, `O(n)`, `System Design`, `Database`, `API`, etc.) are automatically highlighted in **gold/amber pills** in the TopBar live transcript ticker as the interviewer speaks.

### 🛡️ Windows Stealth & DWM Stability
- **Win32 DWM Compositor Stealth Guard:**
  Added a 3-second debounce guard to `SetWindowDisplayAffinity(hwnd, 0x11)` calls in `electron/stealth.ts`. Prevents Win32 compositor buffer invalidation during rapid window show/focus events.

### ✨ Animated Update UI
- **Floating Glassmorphic Update Banner:**
  Update notifications enter with Framer Motion spring physics, a rotating neon conic gradient ring, a moving light shimmer progress beam, and hover-glowing action buttons.

---

## ⌨️ Desktop App Keyboard Shortcuts & Hotkeys

> 📄 Full reference: **[SHORTCUTS.md](SHORTCUTS.md)** · Also published on the website: **[ghotlyai.in/shortcuts](https://www.ghotlyai.in/shortcuts/)**

Use these keyboard shortcuts for 100% stealthy, hands-free operation during your interview:

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `Ctrl + N` | **Next Question** | Saves current Q&A to history, clears screen, and prepares for next question |
| `Ctrl + 0` | **Manual Send** | Immediately sends current live transcript to AI without waiting for silence |
| `Ctrl + E` | **Auto Screen Capture** | Captures full screen, compresses image, and runs AI solution |
| `Left Arrow (←)` or `Ctrl + 8` | **Previous Question** | Instantly navigates back to previous question (`Q1`, `Q2`) |
| `Right Arrow (→)` or `Ctrl + 2` | **Next Question Page** | Instantly navigates forward to next question page |
| `Ctrl + Shift + S` | **Instant Screen Analysis** | Triggers instant screen capture from anywhere in system |
| `Ctrl + Shift + H` | **Toggle Stealth Mode** | Hides/shows app window instantly from screen capture |

---

## 🎯 How to Use Ghostly AI Features

### 1. 🎙️ AI Answer Mode (Live Audio Transcription)
1. Click **`AI Answer`** on TopBar or toggle live mode.
2. Ensure **Deepgram API Key** is set in **Api Setup**.
3. As the interviewer speaks, the live transcript ticker appears in the TopBar with real-time keyword highlighting.
4. Auto AI will automatically trigger a clean answer after **2.2 seconds of silence** (or 800ms if a question mark is asked).
5. Use **`Left Arrow (←)` / `Right Arrow (→)`** to seamlessly cycle through previous Q&As (`Q1`, `Q2`, `Q3`).

### 2. 📸 Screen Analysis Mode
1. Click **`Screen`** tab or press **`Ctrl + E`**.
2. Ghostly AI captures your full screen, compresses it to 800px JPEG, and extracts code/DSA problems.
3. Receives an ultra-fast, syntax-highlighted solution on a single clean page in **under 1 second**.

### 3. 💬 Chat Mode
1. Click **`Chat`** tab for quick follow-up questions or custom coding prompts.
2. Ask for code complexities (`O(n)`), alternative approaches, or line-by-line dry runs.

---

## 🛠️ Tech Stack

- **Desktop Framework:** Electron 28 + React 18 + Vite 5 + TypeScript
- **Styling & Animations:** Vanilla CSS3 + TailwindCSS + Framer Motion
- **AI Providers:** Groq (Llama 3.3 70B), Google Gemini (2.5 Flash), OpenRouter, NVIDIA, Deepgram (Nova-2 Speech-to-Text)
- **Native Stealth:** Win32 `SetWindowDisplayAffinity` API (`user32.dll`)

---

## 📦 Build & Release Commands

```bash
# Start Development Server
npm run dev

# Type Check & Build Electron Bundle
npm run build

# Package Desktop App (.exe setup)
npm run package

# Build & Publish Release to GitHub Automatically
npm run dist
```

---

*Made with ❤️ by Ghostly AI Team — Empowering Candidates Worldwide.*
