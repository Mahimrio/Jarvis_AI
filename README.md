# JARVIS — Personal Voice AI Assistant

A fully functional, voice-driven desktop AI assistant with a cinematic 3D HUD, a cloned JARVIS voice, offline speech recognition, multi-model LLM brain with tool-calling, and real Windows control — built with React, Electron, and FastAPI.

Say **"Hey Jarvis"** and it wakes, greets you in its cloned voice, and does what you ask: opens apps, searches the web, controls volume, takes screenshots, types for you, reads the news, and talks back.

![Electron + React + Python](https://img.shields.io/badge/stack-Electron%20·%20React%20·%20FastAPI-ff6018)

---

## Features

### 🔮 HUD
- 3D particle orb core (~5000 dots, Fibonacci sphere) with 9 animated protocol states
- Audio-reactive "talking" state — the orb swells with Jarvis's actual voice
- Boot cinematic, live clock, real weather, FPS/RAM/network chips
- Collapsible "Neural Link" console with a live voice waveform

### 🧠 Intelligence
- Multi-model brain with automatic routing + failover:
  - Llama 3.3 70B (Groq) for actions, GPT-OSS 120B (Groq) for heavy reasoning, Gemini Flash for fresh-info queries
- Streaming replies, spoken sentence-by-sentence in parallel with the text
- Tool-calling: the LLM controls the app and the OS directly
- Web search (DuckDuckGo, keyless) with cited sources

### 🗣️ Voice
- **Cloned JARVIS voice** via Pocket TTS (local, offline)
- **Wake word "Hey Jarvis"** — openWakeWord on desktop (offline), Web Speech in browser
- **Speech-to-text** — faster-whisper on desktop (offline), Web Speech in browser
- Fully offline voice loop on the desktop: no cloud speech services

### 🖥️ Desktop Agent (Electron)
- Fullscreen frameless native Windows app
- Auto-spawns the Python voice backend on launch
- OS tools: open apps, type into any window, volume/mute, lock, screenshot, shutdown (+cancel)
- Opens links in your real default browser
- Auto-start with Windows (Settings toggle)
- Silent boot — Jarvis stays quiet until you say "hey jarvis"

### 📚 Modules
- Live Feed (news via Currents API + Hacker News fallback + Jarvis's own notes)
- Gmail inbox (IMAP, app-password), chat Memory log, System / Network / Tools / Settings panels

---

## Architecture

```
┌──────────────────────────────┐      ┌───────────────────────────────┐
│  Electron shell (main.ts)    │      │  FastAPI backend :8765        │
│  · fullscreen window         │      │  · Pocket TTS (cloned voice)  │
│  · spawns backend            │◄────►│  · /wake/ws  openWakeWord     │
│  · OS control IPC (PS)       │      │  · /stt/transcribe  whisper   │
├──────────────────────────────┤      │  · /search  DuckDuckGo        │
│  React + Vite UI             │      │  · /mail/*  Gmail IMAP        │
│  · 3D orb (three.js/R3F)     │      └───────────────────────────────┘
│  · LLM chat + tool executor  │                    ▲
│  · mic capture → PCM 16kHz   │────────────────────┘
└──────────────────────────────┘
         │
         ▼
   Groq / Gemini APIs (streaming chat + tool calls)
```

**Voice loop (desktop, fully offline):** mic → `/wake/ws` (openWakeWord `hey_jarvis`) → record utterance (energy VAD) → `/stt/transcribe` (faster-whisper) → LLM with tools → Pocket TTS cloned voice → speakers.

---

## Setup

### Requirements
- Windows 10/11, Node.js 20+, Python 3.13
- A microphone
- Free API keys: [Groq](https://console.groq.com), [Google AI Studio](https://aistudio.google.com) (Gemini), optionally [Currents](https://currentsapi.services) for news
- Hugging Face account with Pocket TTS model terms accepted (for the cloned voice)

### 1. Backend (voice server)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

- Wake-word models download automatically on first run (openWakeWord `hey_jarvis`).
- The whisper model (`small.en`, ~460MB) downloads on first transcription. Override with the `JARVIS_WHISPER_MODEL` env var (`base.en` is 3× faster).
- Optional Gmail: create `backend/.env` with `GMAIL_ADDRESS` and `GMAIL_APP_PASSWORD` (a [Google App Password](https://myaccount.google.com/apppasswords), not your regular password).

### 2. Frontend

```powershell
cd frontend
npm install
```

Create `frontend/.env`:

```
VITE_GROQ_API_KEY=your_groq_key
VITE_GEMINI_API_KEY=your_gemini_key
VITE_NEWS_API_KEY=your_currents_key   # optional
```

### 3. Run (dev)

```powershell
# Terminal 1 — voice backend
cd backend; .\.venv\Scripts\uvicorn main:app --port 8765

# Terminal 2 — UI + Electron window (also auto-spawns the backend if it isn't running)
cd frontend; npm run dev
```

Or just double-click `Jarvis.bat`.

### 4. Build the Windows installer

```powershell
cd frontend
npm run dist
```

Produces `frontend/release/Jarvis Setup 1.0.0.exe` — a one-click installer with Start Menu + desktop shortcuts. The installed app finds the Python backend via the `JARVIS_BACKEND` env var, a `backend-path.txt` file next to the exe, a `backend/` folder next to the exe, or the dev checkout path.

> SmartScreen will warn because the installer is unsigned — "More info → Run anyway".

---

## Usage

| Say / type | Jarvis does |
|---|---|
| "Hey Jarvis" | wakes, opens the console, greets you |
| "open youtube" / "open my portfolio" | opens in your default browser |
| "what's the bitcoin price?" | live web search with cited sources |
| "open calculator", "launch vs code" | starts the app |
| "volume up", "mute", "take a screenshot" | OS control |
| "type hello world" | types into the focused window |
| "lock the computer", "shut down" | lock / shutdown with 30s grace + cancel |
| "check my mail" | reads your Gmail inbox |
| "note that …" | saves a note to the Live Feed |

**Keys:** `Ctrl+R` reload · `Ctrl+Q` quit.

---

## Tech Stack

| Layer | Tech |
|---|---|
| UI | React 19, Vite 8, TypeScript, three.js / react-three-fiber, GSAP |
| Desktop | Electron 43, vite-plugin-electron, electron-builder (NSIS) |
| Backend | FastAPI, Uvicorn, Python 3.13 |
| TTS | Pocket TTS with a cloned JARVIS voice |
| Wake word | openWakeWord (`hey_jarvis`, ONNX, offline) |
| STT | faster-whisper (`small.en`, int8, offline) |
| LLM | Groq (Llama 3.3 70B, GPT-OSS 120B) + Google Gemini, streaming with tool-calling |
| Search | DuckDuckGo (`ddgs`, keyless) |

---

## Project Structure

```
Jarvis/
├── frontend/
│   ├── electron/          # main.ts (window, backend spawn, OS IPC), preload.ts
│   ├── src/
│   │   ├── components/    # JarvisBlob (3D orb), Console, panels, HUD
│   │   └── lib/           # llm.ts (brain+tools), tts.ts, speech.ts, nativeStt.ts, os.ts
│   ├── build/             # app icon + generator script
│   └── package.json       # electron-builder config, npm run dist
├── backend/
│   ├── main.py            # TTS, wake word, whisper, search, mail endpoints
│   ├── voice/             # voice reference sample
│   └── models/            # STT models (gitignored)
└── Jarvis.bat             # dev launcher
```

---

Built by **Mahim Abdullah Rianto** · [github.com/Mahimrio](https://github.com/Mahimrio)