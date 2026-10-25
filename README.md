<p align="center"><img src="icon.png" width="120" alt="Ghotly AI logo — a smiling ghost" /></p>

# Ghostly AI — Stealth Technical Interview Assistant

Ghostly AI is an ultra-fast, stealthy AI assistant engineered specifically for live technical interviews, DSA coding rounds, and system design evaluations. It operates discreetly on your screen, featuring real-time audio transcription, instant screen capture analysis, and deep resume context injection.

---

## ✨ Highlights

- **New logo, animated:** the glossy ghost replaces the old emoji everywhere — in the app, the tray, the installer and the website. It blinks, smiles and waves (and stays still if your system asks for reduced motion).
- **Resume import:** in *Interview Setup → Profile*, upload a resume (PDF, DOCX, TXT or an image/scan). Once an AI key is set up, the AI reads it and fills in your profile, and answers in chat, follow-ups, live transcript and screen analysis are grounded in those facts. The resume is read on your device and sent only to the AI provider you chose.
- **Key backup:** pressing **Test** on an AI provider or Deepgram key also saves it, encrypted, to your Ghotly AI account (see [SECURITY.md](SECURITY.md)).
- **Interview language** is English only; the picker is gone.
- **Job Portal tab** now shows live data from [job.ghotlyai.in](https://job.ghotlyai.in) instead of hand-written text.

---

## 🛡️ What's Fixed in Version 3.5.2

A security and reliability pass over the desktop app.

- **Renderer locked down:** the sponsored frame no longer runs with `allow-same-origin`, so it cannot reach the app's IPC bridge. Model answers are no longer rendered as raw HTML. The renderer runs under a Content Security Policy with the sandbox enabled, navigation to any foreign origin is blocked, and every IPC handler verifies the caller is the app's own top-level frame.
- **Sign-in callback:** the local OAuth listener used to accept a token POST from any website. It now checks the request origin and requires a single-use nonce.
- **Stored keys:** API keys are encrypted with the OS keychain instead of a fixed key that shipped inside the installer. Existing keys are migrated on first launch.
- **Shortcuts:** defaults moved to `Ctrl+Alt+1` through `Ctrl+Alt+8` so they stop colliding with browsers and editors. `Ctrl+E`, `Ctrl+B`, `Ctrl+N` and the other old combinations still work as aliases. Combinations Electron cannot parse are now rejected in the remap dialog instead of silently taking every other shortcut down with them.
- **AI providers:** model IDs come from a single catalog, which ends the recurring "model does not exist" reports. OpenAI reasoning models no longer fail on every request, and the fallback chain no longer sends OpenRouter's free tier to a paid route.
- **Audio:** live transcription is sent at 16 kHz instead of 48 kHz, cutting Deepgram bandwidth and cost by roughly two thirds. The mic test no longer leaks an audio context on every press.
- **Resume import:** parsing runs off the UI thread and is bounded by time, pixel count and archive size.
- **App size:** the packaged payload dropped from 158 MB to 33 MB after removing four unused dependencies.

---

## 🐛 What's Fixed in Version 3.3.5

A bug-fix release addressing real user reports from v3.3.3/v3.3.4:

- **"Model does not exist" / "API keys not working":** Groq's `meta-llama/llama-4-scout-17b-16e-instruct` model was removed from Groq's catalog entirely and errored for every user who had it selected (it was also the **default** Groq model, so this hit new users immediately). Removed it, replaced the default with `llama-3.3-70b-versatile`, and added `openai/gpt-oss-120b`/`20b` as additional free Groq options. If a screenshot is sent while Groq is active (which has no vision model at all now), the app tells the model to ask you to describe the screen instead of erroring or silently ignoring the image.
- **Overlay briefly visible in Google Meet screen share after re-enabling audio:** Every audio (re)start called `getDisplayMedia()` fresh, which removed the window's capture-exclusion flag, re-enumerated screens, and reapplied it ~800ms later — visible in an *already active* screen share for that window. The resolved screen source is now cached after the first successful call, so re-enabling audio mid-interview no longer touches stealth mode at all.
- **"Microphone is not working" with no explanation:** The Audio Setup mic test only ever showed a bare "No Signal ✗" on failure. It now detects the actual cause (OS-level mic permission blocked, no device found, or the mic already in use by another app) and shows a specific, actionable message for each.
- **Keyboard shortcuts didn't actually work as documented:** `Ctrl+Shift+S` and `Ctrl+Shift+H` didn't exist in the code at all — pressing them did nothing. `Ctrl+N`, `Ctrl+0`, `Ctrl+8`, and `Ctrl+2` were only wired up as in-app listeners that required the (usually invisible) overlay window to have keyboard focus, so they silently didn't fire during a real interview where focus stays on Zoom/your IDE. Arrow-key Q-navigation was also registered twice, so every press double-skipped a page. Every shortcut in the table above is now a real, system-wide hotkey that works no matter which window has focus — and screenshots captured via hotkey are now compressed the same 800px/70% JPEG way as the button-triggered flow (they were previously sent uncompressed, several times larger).

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
| `Ctrl + Alt + 1` | **Screenshot** | Captures the screen, compresses it, and runs the AI solution |
| `Ctrl + Alt + 2` | **Ask AI** | Runs the AI on the current transcript without capturing the screen |
| `Ctrl + Alt + 3` | **Show / Hide** | Hides or shows the overlay instantly |
| `Ctrl + Alt + 4` | **Send to AI** | Sends the live transcript without waiting for silence |
| `Ctrl + Alt + 5` | **Next Question** | Saves the current Q&A to history and prepares for the next one |
| `Ctrl + Alt + 6` | **Start Over** | Resets the session |
| `Ctrl + Alt + 7` | **Previous Question** | Goes back one saved Q&A page |
| `Ctrl + Alt + 8` | **Next Question Page** | Goes forward one saved Q&A page |

Every one of these can be remapped in **Settings → Shortcuts**. The old defaults (`Ctrl+E`, `Ctrl+B`, `Ctrl+N`, `Ctrl+G`, `Ctrl+0`, `Ctrl+8`, `Ctrl+2`, `Ctrl+Shift+S`, `Ctrl+Shift+H`) still work as aliases when another app has not claimed them.

---

## 🎯 How to Use Ghostly AI Features

### 1. 🎙️ AI Answer Mode (Live Audio Transcription)
1. Click **`AI Answer`** on TopBar or toggle live mode.
2. Ensure **Deepgram API Key** is set in **Api Setup**.
3. As the interviewer speaks, the live transcript ticker appears in the TopBar with real-time keyword highlighting.
4. Auto AI will automatically trigger a clean answer after **2.2 seconds of silence** (or 800ms if a question mark is asked).
5. Use **`Left Arrow (←)` / `Right Arrow (→)`** to seamlessly cycle through previous Q&As (`Q1`, `Q2`, `Q3`).

### 2. 📸 Screen Analysis Mode
1. Click **`Screen`** tab or press **`Ctrl + Alt + 1`**.
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
