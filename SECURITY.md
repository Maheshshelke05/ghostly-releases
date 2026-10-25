# Security policy

## Privacy and BYOK architecture

**Ghostly AI Desktop App** is built with a **Bring Your Own Key (BYOK)** architecture:

1. **Local key storage**: Your AI provider API keys (Gemini, Groq, OpenAI, Anthropic, OpenRouter, NVIDIA, Grok) and your Deepgram key, plus custom settings, are stored on your local machine. Keys are encrypted with the operating system's credential store through Electron's `safeStorage` API, so the ciphertext is tied to your OS user account. The app ships no decryption key of its own.
2. **Key backup when you press Test**: When you press **Test** next to a key, the app also sends that key over HTTPS to your Ghotly AI account backend, which stores it **encrypted (AES-256-GCM)** against your account. Keys you never test are never sent. The backup is not used to make AI requests on your behalf. Email **support@ghotlyai.in** to have your stored keys deleted.
3. **Direct API calls**: AI requests travel directly from your app to the official API endpoints over TLS/HTTPS.
4. **Resume import**: A resume you upload is read on your device. Its text (or page images, for scanned PDFs) is sent only to the AI provider you picked, using your own key, to fill in your profile. It is not uploaded to Ghotly AI servers.
5. **Stealth overlay security**: On Windows, Ghostly AI uses native OS APIs (`WDA_EXCLUDEFROMCAPTURE`) so the overlay window stays invisible to screen capturing applications (Zoom, Google Meet, Microsoft Teams, Discord).

---

## Application hardening

- The renderer runs with `sandbox: true` and `contextIsolation`, and exposes only the narrow `window.ghostly` bridge.
- Model output is rendered as Markdown. It is never parsed as HTML, so an answer containing markup cannot execute.
- A Content Security Policy in `index.html` restricts scripts, connections and frames to the app and its known endpoints.
- Navigation away from the app is blocked, and links open in the system browser instead of an Electron window.
- Every IPC handler checks that the caller is the app's own top-level frame.
- `app://` asset requests are confined to the renderer directory.
- The local OAuth callback on `127.0.0.1:7842` rejects requests whose `Origin` is not the Ghotly AI site, caps the request body at 64 KB, and accepts a nonce only once.

---

## Reporting a vulnerability

To report a security vulnerability or bug in Ghostly AI Desktop App:

Email: **support@ghotlyai.in** or contact [@Maheshshelke05](https://github.com/Maheshshelke05) on GitHub.

We review all security reports promptly and coordinate fixes before public release.
