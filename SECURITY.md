# Security Policy 🛡️

## Privacy & BYOK Architecture

**Ghostly AI Desktop App** is built with a **Bring Your Own Key (BYOK)** architecture:

1. **Local Key Storage**: Your AI provider API keys (Gemini, Groq, OpenAI, Anthropic, OpenRouter, NVIDIA, Grok) and your Deepgram key, plus custom settings, are stored on your local machine via local storage / electron store and used straight from the app.
2. **Key backup when you press Test**: When you press **Test** next to a key, the app also sends that key over HTTPS to your Ghotly AI account backend, which stores it **encrypted (AES-256-GCM)** against your account. Keys you never test are never sent. The backup is not used to make AI requests on your behalf. Email **support@ghotlyai.in** to have your stored keys deleted.
3. **Direct API Calls**: AI requests travel directly from your app to the official API endpoints over TLS/HTTPS.
4. **Resume import**: A resume you upload is read on your device. Its text (or page images, for scanned PDFs) is sent only to the AI provider you picked, using your own key, to fill in your profile. It is not uploaded to Ghotly AI servers.
5. **Stealth Overlay Security**: On Windows, Ghostly AI uses native OS APIs (`WDA_EXCLUDEFROMCAPTURE`) to ensure the overlay window remains invisible to screen capturing applications (Zoom, Google Meet, Microsoft Teams, Discord).

---

## Reporting a Vulnerability

To report a security vulnerability or bug in Ghostly AI Desktop App:

📧 Email: **support@ghotlyai.in** or contact [@Maheshshelke05](https://github.com/Maheshshelke05) on GitHub.

We review all security reports promptly and coordinate fixes before public release.
