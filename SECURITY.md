# Security Policy 🛡️

## Privacy & BYOK Architecture

**Ghostly AI Desktop App** is built with a **100% Privacy-First, Bring Your Own Key (BYOK)** architecture:

1. **Local Key Storage**: Your AI provider API keys (Gemini, Groq, OpenAI, Anthropic, OpenRouter) and custom settings are stored strictly on your local machine via local storage / electron store.
2. **Direct API Calls**: AI requests travel directly from your app to the official API endpoints over TLS/HTTPS.
3. **Stealth Overlay Security**: On Windows, Ghostly AI uses native OS APIs (`WDA_EXCLUDEFROMCAPTURE`) to ensure the overlay window remains invisible to screen capturing applications (Zoom, Google Meet, Microsoft Teams, Discord).

---

## Reporting a Vulnerability

To report a security vulnerability or bug in Ghostly AI Desktop App:

📧 Email: **support.ghotlyai@gmail.com** or contact [@Maheshshelke05](https://github.com/Maheshshelke05) on GitHub.

We review all security reports promptly and coordinate fixes before public release.
