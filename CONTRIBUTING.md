# Contributing to Ghostly AI Desktop App

Thank you for your interest in contributing to **Ghostly AI Desktop App**. Ghostly AI is a free and open-source stealth interview assistant for Windows, built to help students and software engineers with technical interviews.

---

## Project architecture

Ghostly AI Desktop App is an Electron app built with:

- **Framework**: Electron 28 + React 18 + Vite 5 + TypeScript
- **Styling**: TailwindCSS + Framer Motion
- **Stealth Engine**: Windows Win32 `WDA_EXCLUDEFROMCAPTURE` API (`electron/stealth.ts`)
- **Speech-to-Text**: Deepgram WebSocket API (`src/hooks/useInterviewAudio.ts`)
- **AI Providers**: BYOK (Gemini, Groq, OpenAI, Anthropic, OpenRouter, Grok, Ollama)

---

## Getting started locally

### Prerequisites

- **Node.js**: v20.x or newer
- **npm**: v9+ or v10+
- **OS**: Windows 10/11 (required for native `WDA_EXCLUDEFROMCAPTURE` stealth testing)

### Local setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Maheshshelke05/ghostly-releases.git
   cd ghostly-releases
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

## Key areas for contributions

- **Local STT**: integrating Whisper.cpp or Web Speech API for offline speech-to-text.
- **New LLM connectors**: supporting new providers (DeepSeek V3/R1, Claude 3.7, local Ollama models).
- **Cross-platform stealth**: porting the stealth overlay to macOS and Linux.
- **UI improvements**: dark mode, response text readability and layout polish.

---

## Pull request checklist

1. Run the TypeScript checks for both projects: `npx tsc -p tsconfig.node.json --noEmit` and `npx tsc -p tsconfig.web.json --noEmit`. The root `tsconfig.json` is solution-style (`files: []`), so a bare `npx tsc --noEmit` checks nothing.
2. Test keyboard hotkeys and stealth window behavior in dev mode.
3. Ensure no hardcoded API keys or personal secrets are committed.

Thanks for contributing.
