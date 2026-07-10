# 🎤 Voice Code

> **Claude Code, out loud.** Stop reading the chat — let Claude speak its responses in real-time with natural-sounding neural voices.

Voice Code hooks into Claude Code's streaming output, strips code blocks and markdown, and speaks the text aloud using **Gemini TTS**, **Azure Speech**, or **Kokoro** (local, free, no API key). Hands-free coding, finally.

## ✨ Features

- **Real-time streaming** — audio starts before Claude finishes typing
- **Smart text cleaning** — code blocks skipped, inline code kept, URLs and acronyms handled naturally
- **30+ neural voices** — Gemini voices (Kore, Puck, Fenrir...), Azure voices (Jenny, Guy, Aria...), and 28 Kokoro voices
- **Three TTS providers** — Google Gemini, Microsoft Azure Speech, or Kokoro (local ONNX model, free, offline)
- **Cross-platform** — Linux (ALSA/PulseAudio), macOS (afplay), Windows (PowerShell)
- **Zero config** — `voice-code setup` walks you through everything

## 🚀 Install

```bash
pnpm install -g @vegetz/voice-code
```

Or install from git:

```bash
pnpm install -g https://github.com/VeGETz/VoiceCode.git
```

Or clone and install locally:

```bash
git clone https://github.com/VeGETz/VoiceCode.git
cd VoiceCode
pnpm install -g .
```

Requires Node.js 18+.

## ⚡ Quick Start

```bash
voice-code setup
```

The wizard will:
1. Ask you to pick a TTS provider (Gemini or Azure)
2. Guide you through API key setup
3. Let you browse and preview voices
4. Verify audio playback works
5. Auto-configure the Claude Code hook

That's it. Claude will start speaking.

## 🎮 Commands

| Command | Description |
|---------|-------------|
| `voice-code setup` | Guided setup wizard |
| `voice-code on` | Enable TTS |
| `voice-code off` | Disable TTS |
| `voice-code toggle` | Toggle TTS on/off |
| `voice-code shutup` | Stop all audio immediately (clears queue, kills worker) |
| `voice-code test [text]` | Test TTS with sample text |
| `voice-code voices` | List available voices |
| `voice-code uninstall` | Remove hook and config, then uninstall package |
| `voice-code log [n]` | Show last n log entries |

## 🔑 API Keys

### Gemini (Google)

Get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Set via environment variable:
```bash
export GEMINI_API_KEY=your-key-here
```

Or let the setup wizard save it to `~/.voice-code/config.json`.

### Azure Speech (Microsoft)

Create a Speech resource in the [Azure Portal](https://portal.azure.com).

Set via environment variables:
```bash
export AZURE_SPEECH_KEY=your-key-here
export AZURE_SPEECH_REGION=eastus
```

Or enter them during `voice-code setup`.

### Kokoro (Local, free)

No API key, no account, no cost — runs entirely on your machine via ONNX.

First use downloads the ~80MB model (`onnx-community/Kokoro-82M-v1.0-ONNX`), cached afterward. Pick it during `voice-code setup`.

## 🎙️ Voices

### Gemini Voices

30 voices with distinct personalities — bright, firm, excitable, warm, casual...

```bash
voice-code voices
```

### Azure Voices

Hundreds of neural voices across 100+ languages. Fetched live from the Azure API during setup.

```bash
voice-code voices
```

### Kokoro Voices

28 local voices (US/GB, male/female), default `af_heart` (warm, natural).

```bash
voice-code voices
```

## ⚙️ Configuration

Config lives at `~/.voice-code/config.json`:

```json
{
  "provider": "gemini",
  "voice": "Kore",
  "model": "gemini-3.1-flash-tts-preview",
  "enabled": true,
  "playbackDevice": null,
  "azureKey": null,
  "azureRegion": null,
  "azureVoice": "en-US-JennyNeural",
  "kokoroVoice": "af_heart",
  "kokoroDtype": "q8"
}
```

| Field | Description |
|-------|-------------|
| `provider` | `"gemini"`, `"azure"`, or `"kokoro"` |
| `voice` | Gemini voice name |
| `model` | Gemini TTS model (default `gemini-3.1-flash-tts-preview`) |
| `apiKeyEnv` | Env var name to read the Gemini key from (default `GEMINI_API_KEY`) |
| `azureVoice` | Azure voice name (e.g., `en-US-JennyNeural`) |
| `azureRegion` | Azure region (e.g., `eastus`, `westeurope`) |
| `azureKey` | Azure Speech resource key |
| `kokoroVoice` | Kokoro voice name (default `af_heart`) |
| `kokoroDtype` | Kokoro model quantization: `fp32`, `fp16`, `q8`, `q4`, `q4f16` (default `q8`) |
| `playbackDevice` | Audio device override (null = auto-detect) |

Logs are written to `~/.voice-code/voice-code.log` — view with `voice-code log [n]`.

## 🔧 How It Works

```
Claude Code (MessageDisplay hook)
  → tts-bridge.js (per response chunk, via stdin)
    → clean markdown, split into sentence-sized chunks
    → append complete chunks to a shared queue file
    → spawn tts-worker.js (detached) if none is already running
        tts-worker.js
          → reads the queue, synthesizes via Gemini, Azure, or Kokoro
          → pre-fetches the next sentence while the current one plays
          → re-checks the queue after each pass for late arrivals
          → releases its lock file and exits when the queue is empty
```

1. Claude Code's `MessageDisplay` hook streams each response chunk to `tts-bridge.js` via stdin
2. Text is buffered and cleaned continuously; complete sentence-sized chunks (~300 chars, split on `.`, `!`, `?`) are appended to a shared queue file in the OS temp dir
3. Code blocks are stripped entirely; inline code keeps content but drops backticks
4. URLs become "link", acronyms are spelled out, symbols are expanded
5. `tts-bridge.js` spawns a detached `tts-worker.js` process guarded by a lock file — if a worker is already running, new chunks just get queued for it
6. `tts-worker.js` synthesizes sentences via the configured provider (Gemini, Azure, or Kokoro) and plays them in order, pre-fetching the next sentence's audio while the current one plays so synthesis latency is hidden behind playback
7. This all happens out-of-process from the hook, so Claude Code is never blocked waiting on audio

## 🖥️ Cross-Platform Audio

| Platform | Backend | Notes |
|----------|---------|-------|
| Linux | `paplay` / `aplay` | PulseAudio or ALSA |
| macOS | `afplay` | Built-in |
| Windows | PowerShell `SoundPlayer` | Built-in |

Detected automatically. No extra install needed.

## 🤝 Contributing

```bash
git clone https://github.com/VeGETz/VoiceCode.git
cd VoiceCode
pnpm install
node scripts/tts-bridge.js   # test the bridge
```

## ⚠️ Disclaimer

This project was **100% created by AI**. Use at your own risk.

Using this software with **Gemini TTS** or **Azure Speech** will incur costs on your respective cloud accounts. The author takes no responsibility for any charges, damages, or issues arising from the use of this software.

## 📄 License

[MIT](LICENSE)
