#!/usr/bin/env node

/**
 * Voice Code CLI
 *
 * Usage:
 *   voice-code setup          Guided setup wizard
 *   voice-code on             Enable TTS hook
 *   voice-code off            Disable TTS hook
 *   voice-code toggle         Toggle TTS on/off
 *   voice-code test [text]    Test TTS with sample text
 *   voice-code voices         List available voices
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { input, select, confirm, password } from '@inquirer/prompts';
import { loadConfig, saveConfig, getApiKey, CONFIG_DIR } from '../src/config.js';
import { cleanForSpeech } from '../src/text-cleaner.js';
import { synthesize, resetClient } from '../src/tts-client.js';
import { playAudio, checkPlayback } from '../src/audio-player.js';
import { LOG_FILE } from '../src/logger.js';

const CLAUDE_SETTINGS = join(homedir(), '.claude', 'settings.json');
const HOOK_BRIDGE_PATH = join(import.meta.dirname, '..', 'scripts', 'tts-bridge.js');

const VOICES = [
  { name: 'Zephyr', character: 'Bright' },
  { name: 'Puck', character: 'Upbeat' },
  { name: 'Charon', character: 'Informative' },
  { name: 'Kore', character: 'Firm' },
  { name: 'Fenrir', character: 'Excitable' },
  { name: 'Leda', character: 'Youthful' },
  { name: 'Orus', character: 'Firm' },
  { name: 'Aoede', character: 'Breezy' },
  { name: 'Callirrhoe', character: 'Easy-going' },
  { name: 'Autonoe', character: 'Bright' },
  { name: 'Enceladus', character: 'Breathy' },
  { name: 'Iapetus', character: 'Clear' },
  { name: 'Umbriel', character: 'Easy-going' },
  { name: 'Algieba', character: 'Smooth' },
  { name: 'Despina', character: 'Smooth' },
  { name: 'Erinome', character: 'Clear' },
  { name: 'Algenib', character: 'Gravelly' },
  { name: 'Rasalgethi', character: 'Informative' },
  { name: 'Laomedeia', character: 'Upbeat' },
  { name: 'Achernar', character: 'Soft' },
  { name: 'Alnilam', character: 'Firm' },
  { name: 'Schedar', character: 'Even' },
  { name: 'Gacrux', character: 'Mature' },
  { name: 'Pulcherrima', character: 'Forward' },
  { name: 'Achird', character: 'Friendly' },
  { name: 'Zubenelgenubi', character: 'Casual' },
  { name: 'Vindemiatrix', character: 'Gentle' },
  { name: 'Sadachbia', character: 'Lively' },
  { name: 'Sadaltager', character: 'Knowledgeable' },
  { name: 'Sulafat', character: 'Warm' },
];

// ─── Commands ────────────────────────────────────────────────────

async function setup() {
  console.log('\n🎤 Voice Code Setup\n');

  // Step 1: API Key
  console.log('Step 1: Gemini API Key');
  console.log('Get one at: https://aistudio.google.com/apikey\n');

  const existingConfig = loadConfig();
  const hasEnvKey = process.env.GEMINI_API_KEY;
  const hasConfigKey = existingConfig.apiKey;

  if (hasEnvKey) {
    console.log(`  ✓ GEMINI_API_KEY is set (${hasEnvKey.slice(0, 8)}...)`);
    const useExisting = await confirm({
      message: 'Use existing GEMINI_API_KEY?',
      default: true,
    });
    if (!useExisting) {
      await promptApiKey();
    } else {
      // Save env key to config so hook can access it
      saveConfig({ apiKey: hasEnvKey });
      console.log('  ✓ Key saved to ~/.voice-code/config.json');
    }
  } else if (hasConfigKey) {
    console.log(`  ✓ API key found in config (${hasConfigKey.slice(0, 8)}...)`);
  } else {
    console.log('  ✗ No API key found');
    await promptApiKey();
  }

  // Step 2: Voice selection
  console.log('\nStep 2: Choose a voice\n');

  const voice = await select({
    message: 'Select a voice:',
    choices: VOICES.map((v) => ({
      name: `${v.name} (${v.character})`,
      value: v.name,
    })),
    default: 'Kore',
  });

  // Step 3: Preview voice
  const doPreview = await confirm({
    message: `Preview ${voice}?`,
    default: true,
  });

  if (doPreview) {
    console.log(`\n  🔊 Playing preview for ${voice}...`);
    try {
      const wav = await synthesize(`Hello! I'm ${voice}. I'll be reading Claude's responses for you.`, { voice });
      await playAudio(wav);
    } catch (err) {
      console.error(`  ✗ Preview failed: ${err.message}`);
    }
  }

  // Step 4: Playback check
  console.log('\nStep 3: Audio playback\n');
  const playback = await checkPlayback();
  if (playback.available) {
    console.log(`  ✓ ${playback.message}`);
  } else {
    console.log(`  ✗ ${playback.message}`);
    console.log('  TTS will still work, but audio may not play.');
  }

  // Step 5: Save config
  saveConfig({ voice, enabled: true });
  console.log(`\n  ✓ Config saved to ${CONFIG_DIR}/config.json`);

  // Step 6: Configure Claude Code hook
  console.log('\nStep 4: Claude Code hook\n');
  await configureHook();

  console.log('\n✅ Setup complete! Voice Code is enabled.');
  console.log('   Claude Code will now speak its responses.\n');
  console.log('   Commands: voice-code on | off | toggle | test | voices\n');
}

async function promptApiKey() {
  const key = await password({
    message: 'Enter your Gemini API key:',
    mask: '*',
  });
  if (key) {
    process.env.GEMINI_API_KEY = key;
    saveConfig({ apiKeyEnv: 'GEMINI_API_KEY', apiKey: key });
    console.log('  ✓ API key saved to ~/.voice-code/config.json');
  }
}

async function configureHook() {
  let settings = {};
  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, 'utf8'));
    } catch {
      settings = {};
    }
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.MessageDisplay) settings.hooks.MessageDisplay = [];

  // Check if our hook already exists
  const existingIdx = settings.hooks.MessageDisplay.findIndex((group) =>
    group.hooks?.some((h) => h.command?.includes('voice-code') || h.command?.includes('tts-bridge'))
  );

  const hookEntry = {
    hooks: [
      {
        type: 'command',
        command: `node ${HOOK_BRIDGE_PATH}`,
        timeout: 10,
      },
    ],
  };

  if (existingIdx >= 0) {
    settings.hooks.MessageDisplay[existingIdx] = hookEntry;
  } else {
    settings.hooks.MessageDisplay.push(hookEntry);
  }

  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  console.log('  ✓ Hook added to ~/.claude/settings.json');
}

function cmdOn() {
  const config = loadConfig();
  if (config.enabled) {
    console.log('Voice Code is already enabled.');
    return;
  }
  saveConfig({ enabled: true });
  enableDisableHook(true);
  console.log('🎤 Voice Code enabled.');
}

function cmdOff() {
  const config = loadConfig();
  if (!config.enabled) {
    console.log('Voice Code is already disabled.');
    return;
  }
  saveConfig({ enabled: false });
  enableDisableHook(false);
  console.log('🔇 Voice Code disabled.');
}

function cmdToggle() {
  const config = loadConfig();
  if (config.enabled) {
    cmdOff();
  } else {
    cmdOn();
  }
}

function enableDisableHook(enable) {
  if (!existsSync(CLAUDE_SETTINGS)) return;

  try {
    const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, 'utf8'));
    if (!settings.hooks?.MessageDisplay) return;

    for (const group of settings.hooks.MessageDisplay) {
      for (const hook of group.hooks || []) {
        if (hook.command?.includes('tts-bridge')) {
          // Toggle by commenting/uncommenting the command
          if (enable) {
            hook.command = hook.command.replace(/^# */, '');
          } else if (!hook.command.startsWith('#')) {
            hook.command = `# ${hook.command}`;
          }
        }
      }
    }

    writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  } catch (err) {
    console.error('Failed to update hook:', err.message);
  }
}

async function cmdTest(text) {
  const sample = text || 'Hello! This is Voice Code speaking. Claude Code can now talk to you.';

  console.log(`\n🎤 Testing TTS...`);
  console.log(`   Text: "${sample}"\n`);

  try {
    const cleaned = cleanForSpeech(sample);
    console.log(`   Cleaned: "${cleaned}"\n`);

    console.log('   Synthesizing...');
    const wav = await synthesize(cleaned);

    console.log('   Playing...');
    await playAudio(wav);

    console.log('   ✓ Done!\n');
  } catch (err) {
    console.error(`   ✗ Error: ${err.message}\n`);
    process.exit(1);
  }
}

function cmdVoices() {
  const config = loadConfig();
  console.log('\n🎤 Available voices:\n');
  for (const v of VOICES) {
    const marker = v.name === config.voice ? ' (current)' : '';
    console.log(`  ${v.name.padEnd(18)} ${v.character}${marker}`);
  }
  console.log(`\nChange with: voice-code setup\n`);
}

function cmdLog(lines) {
  const n = parseInt(lines, 10) || 30;
  if (!existsSync(LOG_FILE)) {
    console.log('No log file yet.');
    return;
  }
  const content = readFileSync(LOG_FILE, 'utf8');
  const allLines = content.trim().split('\n');
  const tail = allLines.slice(-n);
  console.log(`\n📋 Last ${tail.length} log entries (${LOG_FILE}):\n`);
  for (const line of tail) {
    console.log(line);
  }
  console.log();
}

// ─── Main ────────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

switch (command) {
  case 'setup':
    setup().catch(handleError);
    break;
  case 'on':
    cmdOn();
    break;
  case 'off':
    cmdOff();
    break;
  case 'toggle':
    cmdToggle();
    break;
  case 'test':
    cmdTest(args.join(' ')).catch(handleError);
    break;
  case 'voices':
    cmdVoices();
    break;
  case 'log':
    cmdLog(args[0]);
    break;
  default:
    console.log(`
🎤 Voice Code — Text-to-speech for Claude Code

Usage:
  voice-code setup          Guided setup wizard
  voice-code on             Enable TTS
  voice-code off            Disable TTS
  voice-code toggle         Toggle TTS
  voice-code test [text]    Test TTS
  voice-code voices         List voices
  voice-code log [n]        Show last n log entries (default 30)
`);
}

function handleError(err) {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
}
