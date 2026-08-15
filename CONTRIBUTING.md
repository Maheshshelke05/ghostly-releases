# Contributing to Ghostly AI Desktop App 👻

Thank you for your interest in contributing to **Ghostly AI Desktop App**! Ghostly AI is a 100% free and open-source stealth AI interview copilot for Windows designed to help students and software engineers ace technical interviews.

---

## 🛠️ Project Architecture

Ghostly AI Desktop App is an Electron app built with:

- **Framework**: Electron 34 + React 18 + Vite 5 + TypeScript
- **Styling**: TailwindCSS + Framer Motion
- **Stealth Engine**: Windows Win32 `WDA_EXCLUDEFROMCAPTURE` API (`electron/stealth.ts`)
- **Speech-to-Text**: Deepgram WebSocket API (`src/hooks/useInterviewAudio.ts`)
- **AI Providers**: BYOK (Gemini, Groq, OpenAI, Anthropic, OpenRouter, Grok, Ollama)

---

## 🚀 Getting Started Locally

### Prerequisites

- **Node.js**: v18.x or v20.x
- **npm**: v9+ or v10+
- **OS**: Windows 10/11 (required for native `WDA_EXCLUDEFROMCAPTURE` stealth testing)

### Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Maheshshelke05/ghostly-releases.git
   cd ghostly-desktop-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Build and test production bundle:**
   ```bash
   npm run build
   ```

---

## 💡 Key Areas for Community Contributions

- 🎤 **Local STT**: Integrating Whisper.cpp or Web Speech API for offline speech-to-text.
- 🤖 **New LLM Connectors**: Supporting new providers (DeepSeek V3/R1, Claude 3.7, local Ollama models).
- 🥷 **Cross-Platform Stealth**: Porting stealth overlay functionality to macOS / Linux.
- 🎨 **UI Improvements**: Shortcut remapping UI, dark modes, response text readability.

---

## 📝 Pull Request Checklist

1. Run TypeScript checks: `npx tsc --noEmit`
2. Test keyboard hotkeys and stealth window behavior in dev mode.
3. Ensure no hardcoded API keys or personal secrets are committed.

Thank you for contributing! 🚀
