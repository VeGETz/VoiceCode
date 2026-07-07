# 🎤 Voice Code

> **Claude Code, out loud.** Stop reading the chat — let Claude speak its responses in real-time with natural-sounding neural voices.

Voice Code hooks into Claude Code's streaming output, strips code blocks and markdown, and speaks the text aloud using **Gemini TTS** or **Azure Speech**. Hands-free coding, finally.

## ✨ Features

- **Real-time streaming** — audio starts before Claude finishes typing
- **Smart text cleaning** — code blocks skipped, inline code kept, URLs and acronyms handled naturally
- **30+ neural voices** — Gemini voices (Kore, Puck, Fenrir...) and Azure voices (Jenny, Guy, Aria...)
- **Two TTS providers** — Google Gemini and Microsoft Azure Speech
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
  "azureVoice": "en-US-JennyNeural"
}
```

| Field | Description |
|-------|-------------|
| `provider` | `"gemini"` or `"azure"` |
| `voice` | Gemini voice name |
| `azureVoice` | Azure voice name (e.g., `en-US-JennyNeural`) |
| `azureRegion` | Azure region (e.g., `eastus`, `westeurope`) |
| `playbackDevice` | Audio device override (null = auto-detect) |

## 🔧 How It Works

```
Claude Code (MessageDisplay hook)
  → tts-bridge.js (Node.js)
    → accumulate text chunks into sentences
    → strip code blocks, clean markdown
    → Gemini TTS or Azure Speech API
      → WAV audio playback
```

1. Claude Code's `MessageDisplay` hook streams each response chunk to `tts-bridge.js`
2. Text is buffered until sentence boundaries (`.`, `!`, `?`) for natural speech flow
3. Code blocks are stripped entirely; inline code keeps content but drops backticks
4. URLs become "link", acronyms are spelled out, symbols are expanded
5. Synthesized audio is played asynchronously — doesn't block Claude

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
