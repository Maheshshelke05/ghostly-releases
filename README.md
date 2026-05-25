# Ghostly AI (Chiku AI) - Stealth Technical Interview Assistant 🚀

Ghostly AI is an advanced, ultra-stealthy AI assistant designed specifically for technical interviews. It seamlessly blends into your workflow, providing real-time code analysis, live audio transcription answering, and deep contextual personalization based on your actual resume and experience.

## 🚀 What's New in Version 1.1.6

Version 1.1.6 is a massive quality-of-life and performance update, heavily focused on making the AI feel **faster, smarter, and incredibly human**.

### ✨ Major Features & Improvements
- **Smart Question Extraction:** The Live Mic (AI Answer) feature now intelligently parses long, messy audio transcripts to extract the exact core question being asked.
- **Golden UI Highlights:** Detected questions are now beautifully highlighted in a custom golden/yellow accent box, keeping the UI clean and highly readable.
- **Ultra-Fast, High-Impact Answers:** AI Prompts have been completely overhauled across all features. Answers are now strictly limited to 100-150 words (max 200) for maximum conciseness.
- **Killer Openings:** The AI is now explicitly trained to deliver a "hook" in the first 3-4 lines—showing deep expertise immediately to impress interviewers right off the bat.
- **Deep Personalization:** The Live Transcription feature now dynamically injects your saved Profile Data (projects, skills, experience). The AI speaks *as you*, making it sound 100% authentic and conversational.
- **Smooth Typing Animation:** A new blinking cursor (`▍`) animation has been added to the streaming output, making the text generation feel smooth and natural line-by-line.

### 🛠️ Fixes & Enhancements
- **Resizable App Window:** The frameless app window is now fully resizable! You can drag the edges to make the chat container as big or small as you want.
- **Expanded OpenRouter Models:** Added powerful new free models to the OpenRouter integration (including *NVIDIA Nemotron 3 30B, Google Gemma 4 31B, Baidu Qianfan OCR Fast*, etc.).
- **OpenRouter API Bug Fix:** Fixed a critical API routing bug where the app attempted to pass a Groq-exclusive model ID (`llama-3.3-70b-versatile`) to OpenRouter, causing crash errors.

---

## Key Features
- **Screen Analysis:** Instantly analyze complex coding/DSA/system design problems via screen capture.
- **Live Transcription:** Real-time system audio capture and AI answering.
- **Stealth UI:** Frameless, transparent, and discreet interface that floats above everything.
- **Bring Your Own Key (BYOK):** Full support for Groq, OpenRouter, Gemini, OpenAI, and Anthropic.

## Tech Stack
- Electron & React
- TypeScript
- Vite
- TailwindCSS
- Framer Motion

## Getting Started
1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Build for production: `npm run build`
