# Voice Code

Text-to-speech for Claude Code. Captures Claude's streaming response via the `MessageDisplay` hook, strips code blocks, and speaks the text using Gemini TTS.

## How It Works

```
Claude Code (MessageDisplay hook)
    → voice-code bridge script (Node.js)
        → accumulate text chunks into sentences
        → markdown parser strips code blocks
        → clean URLs, acronyms, symbols
        → Gemini TTS API (streaming)
            → audio playback (aplay/paplay/afplay)
```

## Stack

- **Runtime**: Node.js 18+
- **Install**: `pnpm install -g voice-code` → `voice-code setup` (guided wizard)
- **TTS**: `@google/genai` (official Gemini SDK)
- **Markdown**: `marked` (parse + custom renderer)
- **CLI wizard**: `@inquirer/prompts`
- **Audio**: `play-sound` (cross-platform: aplay/paplay/afplay/PowerShell)

## Architecture

- **CLI** (`bin/voice-code.js`) — Entry point. `voice-code setup` runs guided wizard, `voice-code on/off/toggle` manages hook.
- **Hook bridge** (`scripts/tts-bridge.js`) — Receives streaming text from Claude Code's `MessageDisplay` hook via stdin. Accumulates chunks until sentence boundaries, then sends cleaned text to TTS.
- **Text cleaner** (`src/text-cleaner.js`) — Uses `marked` to parse markdown. Strips fenced code blocks, keeps inline code content (drops backticks), replaces URLs with "link", repairs sentence flow.
- **TTS client** (`src/tts-client.js`) — Calls Gemini TTS API (`gemini-3.1-flash-tts-preview`) with streaming. Returns PCM audio chunks.
- **Audio player** (`src/audio-player.js`) — Plays PCM audio via `play-sound` (cross-platform). Writes WAV to temp file, plays async.
- **Config** (`~/.voice-code/config.json`) — Voice, API key path, playback settings. Created by setup wizard.

## Key Design Decisions

1. **Sentence-level buffering** — Don't send every tiny chunk to TTS. Accumulate until `.`, `!`, `?`, or `\n\n` to get natural prosody.
2. **Code blocks are skipped entirely** — Code is rarely useful spoken aloud. Inline code (like `git status`) keeps the content but drops backticks.
3. **Streaming TTS** — Use Gemini 3.1 Flash's streaming mode so audio starts playing before the full sentence is synthesized.
4. **Node.js** — Matches Claude Code's ecosystem. The `marked` library handles markdown parsing.

## File Structure

```
voice-code/
├── CLAUDE.md
├── package.json
├── bin/
│   └── voice-code.js        # CLI entry point (setup/on/off/toggle/test)
├── scripts/
│   └── tts-bridge.js        # MessageDisplay hook bridge
├── src/
│   ├── text-cleaner.js      # Markdown → speech-ready text
│   ├── tts-client.js        # Gemini TTS API wrapper
│   ├── audio-player.js      # Cross-platform audio playback
│   └── config.js            # Config load/save (~/.voice-code/config.json)
└── hooks/
    └── voice-code.json      # Hook config template
```

## Install & Setup

```bash
pnpm install -g voice-code
voice-code setup
# Guided wizard asks for:
#   1. Gemini API key
#   2. Voice selection (preview each)
#   3. Playback device
# Then auto-configures Claude Code hook
```

## Commands

```bash
voice-code setup             # Guided setup wizard
voice-code on                # Enable TTS hook
voice-code off               # Disable TTS hook
voice-code toggle            # Toggle TTS on/off
voice-code test [text]       # Test TTS with sample text
voice-code voices            # List available voices
```

## Gemini TTS API

- **Model**: `gemini-3.1-flash-tts-preview`
- **Auth**: `GEMINI_API_KEY` env var
- **Voices**: 30 options (default: `Kore` — firm, clear)
- **Output**: PCM WAV, mono, 24kHz, 16-bit, base64
- **Streaming**: Supported on 3.1 Flash only
- **Audio tags**: `[whispers]`, `[excitedly]`, etc. (no SSML)

## Commands

```bash
pnpm install                 # Install dependencies
node scripts/tts-bridge.js   # Test the bridge (reads stdin)
pnpm test                    # Run tests
```

## Cross-Platform

| Platform | Audio backend | Install requirement |
|---|---|---|
| Linux | `aplay` (ALSA) or `paplay` (PulseAudio) | Pre-installed on most distros |
| macOS | `afplay` | Pre-installed |
| Windows | PowerShell `SoundPlayer` | Pre-installed |

`play-sound` handles detection automatically. If no player found, setup wizard warns.

## Conventions

- Use `marked` for markdown parsing (not regex)
- Keep the text cleaner fast — it runs on every streaming chunk
- Audio playback must not block the hook (spawn async)
- Log errors to stderr, not stdout (stdout is for hook protocol)
- Config lives in `~/.voice-code/` (not in project dir)
- Hook writes to `~/.claude/settings.json` via `config.js` helper
