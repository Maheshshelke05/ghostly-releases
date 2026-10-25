<p align="center"><img src="icon.png" width="120" alt="Ghotly AI logo, a smiling ghost" /></p>

# Ghostly AI: stealth technical interview assistant

Ghostly AI is a stealthy desktop assistant for live technical interviews, DSA coding rounds and system design evaluations. It stays out of screen shares and captures, transcribes the interviewer in real time, analyzes screen captures, and grounds its answers in your resume.

---

## Highlights

- **New logo, animated:** the ghost logo replaces the old emoji in the app, the tray, the installer and the website. It blinks, smiles and waves, and stays still if your system asks for reduced motion.
- **Resume import:** in *Interview Setup → Profile*, upload a resume (PDF, DOCX, TXT or an image/scan). Once an AI key is set up, the AI reads it and fills in your profile, and answers in chat, follow-ups, live transcript and screen analysis are grounded in those facts. The resume is read on your device and sent only to the AI provider you chose.
- **Key backup:** pressing **Test** on an AI provider or Deepgram key also saves it, encrypted, to your Ghotly AI account (see [SECURITY.md](SECURITY.md)).
- **Interview language** is English only; the picker is gone.
- **Job Portal tab** now shows live data from [job.ghotlyai.in](https://job.ghotlyai.in) instead of hand-written text.

---

## What's fixed in version 3.5.2

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

## What's fixed in version 3.3.5

A bug-fix release for user reports from v3.3.3 and v3.3.4:

- **"Model does not exist" / "API keys not working":** Groq removed `meta-llama/llama-4-scout-17b-16e-instruct` from its catalog, so every user who had it selected got an error, including new users because it was the **default** Groq model. The default is now `llama-3.3-70b-versatile`, and `openai/gpt-oss-120b` / `20b` are additional free Groq options. Groq has no vision model now, so when a screenshot is sent while Groq is active, the app tells the model to ask you to describe the screen instead of erroring or silently ignoring the image.
- **Overlay briefly visible in a Google Meet screen share after re-enabling audio:** every audio (re)start called `getDisplayMedia()` fresh, which removed the window's capture-exclusion flag, re-enumerated screens and reapplied the flag about 800ms later, so the overlay showed up in an already active screen share. The resolved screen source is now cached after the first successful call, so re-enabling audio mid-interview no longer touches stealth mode.
- **"Microphone is not working" with no explanation:** the Audio Setup mic test showed only a bare "No Signal" on failure. It now detects the actual cause (OS-level mic permission blocked, no device found, or the mic already in use by another app) and shows a specific message for each.
- **Keyboard shortcuts didn't actually work as documented:** `Ctrl+Shift+S` and `Ctrl+Shift+H` didn't exist in the code at all, so pressing them did nothing. `Ctrl+N`, `Ctrl+0`, `Ctrl+8` and `Ctrl+2` were only wired up as in-app listeners that required the (usually invisible) overlay window to have keyboard focus, so they didn't fire during a real interview where focus stays on Zoom or your IDE. Arrow-key Q-navigation was registered twice, so every press skipped two pages. Every shortcut in the table above is now a system-wide hotkey that works no matter which window has focus, and screenshots captured via hotkey are compressed the same 800px/70% JPEG way as the button-triggered flow (they used to be sent uncompressed).

---

## What's new in version 3.3.4

Version 3.3.4 covers performance, reliability and UX: smaller image payloads, throttled streaming updates, audio silence detection and live API key checks.

### Performance

- **800px HTML5 canvas image compression:**
  Full-resolution 4K/1080p screenshots are automatically downscaled to 800px width at 70% JPEG quality before sending to Vision AI APIs. Payload size drops from ~4MB to **~40KB**.
- **50ms streaming state throttle:**
  Throttles React state updates during AI streaming (Groq at ~500 tokens/sec) to a steady 20 FPS (every 50ms). Cuts CPU load by **95%** and keeps the app responsive to mouse clicks, window dragging and hotkeys.
- **Live end-to-end API key verification:**
  `ApiSetupPage` no longer runs dummy ping checks. Each key is tested against the real endpoint:
  - **Deepgram:** sends a silent WAV buffer to `/v1/listen` (Nova-2 model).
  - **Gemini:** sends a 1-part test completion to `generateContent`.
  - **Groq / OpenRouter / NVIDIA:** sends a 1-token test chat completion.

### Live audio and silence detection

- **Auto QA history pages:**
  When live mode detects a new question, the previous Q&A is saved to a QA history page (`Q1`, `Q2`, `Q3`...), so answers are not overwritten.
- **Short filler filter:**
  Phrases shorter than 4 words (for example "yeah", "okay", "right", "got it") without a question mark (`?`) are ignored, which keeps background noise off your screen.
- **Silence pacing:**
  Default silence detection is **2.2 seconds (2200ms)**, with an **800ms trigger** when the sentence ends in a question mark (`?`).
- **Real-time keyword highlighting:**
  Technical terms (`Array`, `PostgreSQL`, `React`, `Python`, `O(n)`, `System Design`, `Database`, `API` and others) are highlighted in gold/amber pills in the TopBar live transcript ticker as the interviewer speaks.

### Windows stealth and DWM stability

- **Win32 DWM compositor guard:**
  Added a 3-second debounce guard to `SetWindowDisplayAffinity(hwnd, 0x11)` calls in `electron/stealth.ts`. Prevents Win32 compositor buffer invalidation during rapid window show/focus events.

### Update banner

- **Floating update banner:**
  Update notifications enter with Framer Motion spring physics, a rotating conic gradient ring, a shimmer progress beam and hover states on the action buttons.

---

## Desktop app keyboard shortcuts

> Full reference: **[SHORTCUTS.md](SHORTCUTS.md)**. Also published on the website: **[ghotlyai.in/shortcuts](https://www.ghotlyai.in/shortcuts/)**

Every hotkey below is registered system-wide, so it works while another window has focus:

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

## How to use the features

### 1. AI Answer mode (live audio transcription)
1. Click **`AI Answer`** on TopBar or toggle live mode.
2. Ensure **Deepgram API Key** is set in **Api Setup**.
3. As the interviewer speaks, the live transcript ticker appears in the TopBar with real-time keyword highlighting.
4. Auto AI triggers a clean answer after **2.2 seconds of silence**, or 800ms if a question mark is asked.
5. Use **`Left Arrow (←)` / `Right Arrow (→)`** to move through previous Q&As (`Q1`, `Q2`, `Q3`).

### 2. Screen analysis mode
1. Click the **`Screen`** tab or press **`Ctrl + Alt + 1`**.
2. Ghostly AI captures your full screen, compresses it to 800px JPEG, and extracts code or DSA problems.
3. A syntax-highlighted solution arrives on a single page.

### 3. Chat mode
1. Click the **`Chat`** tab for quick follow-up questions or custom coding prompts.
2. Ask for code complexities (`O(n)`), alternative approaches, or line-by-line dry runs.

---

## Tech stack

- **Desktop Framework:** Electron 28 + React 18 + Vite 5 + TypeScript
- **Styling & Animations:** Vanilla CSS3 + TailwindCSS + Framer Motion
- **AI Providers:** Groq (Llama 3.3 70B), Google Gemini (2.5 Flash), OpenRouter, NVIDIA, Deepgram (Nova-2 Speech-to-Text)
- **Native Stealth:** Win32 `SetWindowDisplayAffinity` API (`user32.dll`)

---

## Build and release commands

```bash
# Start development server
npm run dev

# Type check and build the Electron bundle
npm run build

# Package the desktop app (.exe setup)
npm run package

# Build and publish a release to GitHub
npm run dist
```

---

*Maintained by the Ghostly AI team.*
