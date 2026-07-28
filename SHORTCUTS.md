# ⌨️ Ghostly AI — Keyboard Shortcuts & Hotkeys (v3.3.5)

Run Ghostly AI 100% hands-free and stealthy during a live interview — every action below is mapped to a keyboard shortcut so you never need to touch the mouse or reveal the app on screen share.

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `Ctrl + N` | **Next Question** | Saves the current Q&A to history, clears the screen, and prepares for the next question. |
| `Ctrl + 0` | **Manual Send** | Immediately sends the current live transcript to AI without waiting for silence detection. |
| `Ctrl + E` | **Auto Screen Capture** | Captures the full screen, compresses the image (800px/70% JPEG), and runs the AI solution. (Alias: `Ctrl + Shift + S`) |
| `Left Arrow (←)` or `Ctrl + 8` | **Previous Question** | Instantly navigates back to the previous question/answer (Q1, Q2...). Arrow keys only work while the app window has focus — `Ctrl + 8` works from anywhere. |
| `Right Arrow (→)` or `Ctrl + 2` | **Next Question Page** | Instantly navigates forward to the next question page. Arrow keys only work while the app window has focus — `Ctrl + 2` works from anywhere. |
| `Ctrl + Shift + S` | **Instant Screen Analysis** | Same action as `Ctrl + E` — triggers an instant screen capture from anywhere in the system, not just inside the app window. |
| `Ctrl + Shift + H` | **Toggle Stealth Mode** | Hides/shows the app window instantly from screen recording and screen sharing. (Alias: `Ctrl + B`) |
| `Ctrl + G` | **Start Over** | Resets the current session — clears the transcript, screenshots, and Q&A history to start fresh. |

## Where these are handled

All global hotkeys are registered in [`electron/hotkeys.ts`](electron/hotkeys.ts) and dispatched to the renderer via IPC (see [`electron/ipc.ts`](electron/ipc.ts) and [`electron/preload.ts`](electron/preload.ts)). Stealth toggling additionally calls the Win32 `SetWindowDisplayAffinity` guard in [`electron/stealth.ts`](electron/stealth.ts).

## Quick usage flow

1. **Live interview:** Let Auto AI answer automatically after 2.2s of silence (or 800ms if the interviewer's sentence ends in `?`). Use `Ctrl + N` after each question to keep history clean.
2. **Coding round:** Press `Ctrl + E` or `Ctrl + Shift + S` to capture and solve a DSA/system-design screenshot in under a second.
3. **Reviewing:** Use `←` / `→` (or `Ctrl + 8` / `Ctrl + 2`) to flip between saved Q&A pages without losing your place.
4. **Screen share safety:** `Ctrl + Shift + H` instantly hides the overlay if you need to share a different window.

See [README.md](README.md) for the full v3.3.5 changelog and feature walkthrough.
