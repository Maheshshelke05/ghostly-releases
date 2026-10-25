# Ghostly AI keyboard shortcuts (v3.5.2)

Run Ghostly AI hands-free during a live interview. Every action below is a system-wide hotkey, so it works no matter which window has focus.

| Shortcut | Action | Older alias | Description |
| :--- | :--- | :--- | :--- |
| `Ctrl + Alt + 1` | **Screenshot** | `Ctrl + Shift + S`, `Ctrl + E` | Captures the full screen, compresses it (800px / 70% JPEG), and runs the AI solution. |
| `Ctrl + Alt + 2` | **Ask AI** | `Ctrl + Return` | Answers using the current transcript, without a screen capture. |
| `Ctrl + Alt + 3` | **Show / Hide** | `Ctrl + Shift + H`, `Ctrl + B` | Hides or shows the overlay instantly. |
| `Ctrl + Alt + 4` | **Send to AI** | `Ctrl + 0` | Sends the live transcript immediately instead of waiting for silence. |
| `Ctrl + Alt + 5` | **Next Question** | `Ctrl + N` | Saves the current Q&A to history and prepares for the next question. |
| `Ctrl + Alt + 6` | **Start Over** | `Ctrl + G` | Clears the transcript, screenshots and Q&A history. |
| `Ctrl + Alt + 7` | **Previous Question** | `Ctrl + 8` | Goes back one saved Q&A page. |
| `Ctrl + Alt + 8` | **Next Question Page** | `Ctrl + 2` | Goes forward one saved Q&A page. |

Moving the window is fixed and not remappable: `Ctrl + ↑`, `Ctrl + ↓`, `Ctrl + ←`, `Ctrl + →`.

## Remapping

Open **Settings → Shortcuts** and click a shortcut, then press the combination you want. Two things to know:

- If another running app already owns the combination, Ghostly tells you and keeps your previous binding.
- If Electron cannot express the combination (for example a bare modifier, `Ctrl+Space` sent without a key, or a key reported as `Dead` / `Unidentified` / `AltGraph`), the dialog says so instead of saving a binding that will never fire.

The defaults deliberately use `Ctrl+Alt` because the old ones collided with common shortcuts: `Ctrl+E` is the browser address bar, `Ctrl+B` is the bookmarks sidebar, `Ctrl+N` is a new window, and `Ctrl+G` is find-next.

## Where these are handled

Defaults and registration live in [`electron/hotkeys.ts`](electron/hotkeys.ts). Every binding is validated by [`electron/accelerator.ts`](electron/accelerator.ts) before it reaches Electron's `globalShortcut`, because Electron throws on a malformed accelerator rather than returning false, and an unprotected throw used to unregister everything. The renderer builds the strings in [`src/lib/shortcuts.ts`](src/lib/shortcuts.ts). Stealth toggling calls the Win32 `SetWindowDisplayAffinity` guard in [`electron/stealth.ts`](electron/stealth.ts).

## Quick usage flow

1. **Live interview:** let Auto AI answer after 2.2 s of silence, or 800 ms when the interviewer's sentence ends in `?`. Press `Ctrl + Alt + 5` after each question to keep history clean.
2. **Coding round:** press `Ctrl + Alt + 1` to capture and solve a DSA or system-design prompt.
3. **Reviewing:** `Ctrl + Alt + 7` and `Ctrl + Alt + 8` flip between saved Q&A pages.
4. **Screen share safety:** `Ctrl + Alt + 3` hides the overlay when you need to share another window.

See [README.md](README.md) for the feature walkthrough and changelog.
