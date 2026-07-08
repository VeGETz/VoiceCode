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
import { homedir, tmpdir } from 'node:os';
import { input, select, confirm, password } from '@inquirer/prompts';
import { loadConfig, saveConfig, getApiKey, CONFIG_DIR } from '../src/config.js';
import { cleanForSpeech } from '../src/text-cleaner.js';
import { synthesize, resetClient, listVoices as fetchProviderVoices } from '../src/tts-client.js';
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

  // Step 1: Provider selection
  const existingConfig = loadConfig();

  console.log('Step 1: Choose TTS provider\n');

  const provider = await select({
    message: 'Select TTS provider:',
    choices: [
      { name: 'Gemini (Google)', value: 'gemini' },
      { name: 'Azure Speech (Microsoft)', value: 'azure' },
      { name: 'Kokoro (Local, free)', value: 'kokoro' },
    ],
    default: existingConfig.provider || 'gemini',
  });

  let voice;

  if (provider === 'azure') {
    // Azure setup flow
    await setupAzure(existingConfig);
  } else if (provider === 'kokoro') {
    // Kokoro setup flow (local, no API key)
    await setupKokoro(existingConfig);
  } else {
    // Gemini setup flow
    await setupGemini(existingConfig);
  }

  // Playback check
  console.log('\nStep: Audio playback\n');
  const playback = await checkPlayback();
  if (playback.available) {
    console.log(`  ✓ ${playback.message}`);
  } else {
    console.log(`  ✗ ${playback.message}`);
    console.log('  TTS will still work, but audio may not play.');
  }

  // Configure Claude Code hook
  console.log('\nStep: Claude Code hook\n');
  await configureHook();

  console.log('\n✅ Setup complete! Voice Code is enabled.');
  console.log('   Claude Code will now speak its responses.\n');
  console.log('   Commands: voice-code on | off | toggle | test | voices\n');
}

async function setupGemini(existingConfig) {
  console.log('\n  Gemini API Key');
  console.log('  Get one at: https://aistudio.google.com/apikey\n');

  const hasEnvKey = process.env.GEMINI_API_KEY;
  const hasConfigKey = existingConfig.apiKey;

  if (hasEnvKey) {
    console.log(`  ✓ GEMINI_API_KEY is set (${hasEnvKey.slice(0, 8)}...)`);
    const useExisting = await confirm({
      message: 'Use existing GEMINI_API_KEY?',
      default: true,
    });
    if (!useExisting) {
      await promptGeminiKey();
    } else {
      saveConfig({ apiKey: hasEnvKey });
      console.log('  ✓ Key saved to ~/.voice-code/config.json');
    }
  } else if (hasConfigKey) {
    console.log(`  ✓ API key found in config (${hasConfigKey.slice(0, 8)}...)`);
  } else {
    console.log('  ✗ No API key found');
    await promptGeminiKey();
  }

  // Voice selection
  console.log('\n  Choose a voice\n');

  const voice = await select({
    message: 'Select a voice:',
    choices: VOICES.map((v) => ({
      name: `${v.name} (${v.character})`,
      value: v.name,
    })),
    default: existingConfig.voice || 'Kore',
  });

  // Preview
  const doPreview = await confirm({
    message: `Preview ${voice}?`,
    default: true,
  });

  if (doPreview) {
    console.log(`\n  🔊 Playing preview for ${voice}...`);
    try {
      const wav = await synthesize(`Hello! I'm ${voice}. I'll be reading Claude's responses for you.`, { voice, provider: 'gemini' });
      await playAudio(wav);
    } catch (err) {
      console.error(`  ✗ Preview failed: ${err.message}`);
    }
  }

  saveConfig({ provider: 'gemini', voice, enabled: true });
  console.log(`\n  ✓ Config saved to ${CONFIG_DIR}/config.json`);
}

async function setupAzure(existingConfig) {
  // Azure credentials
  console.log('\n  Azure Speech credentials');
  console.log('  Get them at: https://portal.azure.com → Speech resource\n');

  const hasEnvKey = process.env.AZURE_SPEECH_KEY;
  const hasConfigKey = existingConfig.azureKey;

  let azureKey, azureRegion;

  if (hasEnvKey && process.env.AZURE_SPEECH_REGION) {
    console.log(`  ✓ AZURE_SPEECH_KEY is set (${hasEnvKey.slice(0, 8)}...)`);
    console.log(`  ✓ AZURE_SPEECH_REGION is set (${process.env.AZURE_SPEECH_REGION})`);
    const useExisting = await confirm({
      message: 'Use existing Azure credentials?',
      default: true,
    });
    if (useExisting) {
      azureKey = hasEnvKey;
      azureRegion = process.env.AZURE_SPEECH_REGION;
    }
  }

  if (!azureKey) {
    azureKey = await password({
      message: 'Enter your Azure Speech resource key:',
      mask: '*',
    });

    azureRegion = await input({
      message: 'Enter your Azure region (e.g., eastus, westeurope):',
      default: existingConfig.azureRegion || 'eastus',
    });
  }

  // Save provider + credentials together so listVoices() sees the correct provider
  saveConfig({ provider: 'azure', azureKey, azureRegion });
  console.log('  ✓ Credentials saved to ~/.voice-code/config.json');

  // Set env vars so the TTS client can use them
  process.env.AZURE_SPEECH_KEY = azureKey;
  process.env.AZURE_SPEECH_REGION = azureRegion;

  // Voice selection — fetch from Azure API
  console.log('\n  Fetching available voices...\n');

  let azureVoice = existingConfig.azureVoice || 'en-US-JennyNeural';

  try {
    const voices = await fetchProviderVoices();
    // Show top English voices as quick picks, with option to see all
    const englishVoices = voices.filter(v => v.locale?.startsWith('en-'));
    const otherVoices = voices.filter(v => !v.locale?.startsWith('en-'));

    const voiceChoices = [
      ...englishVoices.map(v => ({
        name: `${v.displayName} (${v.locale}, ${v.gender})`,
        value: v.name,
      })),
      ...otherVoices.slice(0, 20).map(v => ({
        name: `${v.displayName} (${v.locale}, ${v.gender})`,
        value: v.name,
      })),
    ];

    azureVoice = await select({
      message: 'Select a voice:',
      choices: voiceChoices,
      default: azureVoice,
    });
  } catch (err) {
    console.log(`  ⚠ Could not fetch voices: ${err.message}`);
    azureVoice = await input({
      message: 'Enter Azure voice name (e.g., en-US-JennyNeural):',
      default: azureVoice,
    });
  }

  // Preview
  const doPreview = await confirm({
    message: `Preview ${azureVoice}?`,
    default: true,
  });

  if (doPreview) {
    console.log(`\n  🔊 Playing preview for ${azureVoice}...`);
    try {
      const wav = await synthesize(`Hello! I'm ${azureVoice}. I'll be reading Claude's responses for you.`, { voice: azureVoice, provider: 'azure' });
      await playAudio(wav);
    } catch (err) {
      console.error(`  ✗ Preview failed: ${err.message}`);
    }
  }

  saveConfig({ provider: 'azure', azureVoice, enabled: true });
  console.log(`\n  ✓ Config saved to ${CONFIG_DIR}/config.json`);
}

async function setupKokoro(existingConfig) {
  console.log('\n  Kokoro TTS (local, no API key needed)');
  console.log('  Runs entirely on your machine using ONNX Runtime.\n');

  // Import voice list
  const { AVAILABLE_VOICES } = await import('../src/tts-client-kokoro.js');

  console.log('  Choose a voice\n');

  const voiceChoices = AVAILABLE_VOICES.map(v => ({
    name: `${v.id.padEnd(16)} ${v.grade.padEnd(4)} ${v.gender.padEnd(8)} ${v.traits}`,
    value: v.id,
  }));

  const kokoroVoice = await select({
    message: 'Select a voice:',
    choices: voiceChoices,
    default: existingConfig.kokoroVoice || 'af_heart',
  });

  // Preview
  const doPreview = await confirm({
    message: `Preview ${kokoroVoice}? (first run downloads the model)`,
    default: true,
  });

  if (doPreview) {
    console.log(`\n  🔊 Playing preview for ${kokoroVoice}...`);
    console.log('  (First run downloads ~80MB model — this may take a moment)\n');

    try {
      const wav = await synthesize(`Hello! I'm ${kokoroVoice}. I'll be reading Claude's responses for you.`, {
        voice: kokoroVoice,
        provider: 'kokoro',
      });

      await playAudio(wav);
    } catch (err) {
      console.error(`  ✗ Preview failed: ${err.message}`);
    }
  }

  saveConfig({ provider: 'kokoro', kokoroVoice, enabled: true });
  console.log(`\n  ✓ Config saved to ${CONFIG_DIR}/config.json`);
}

async function promptGeminiKey() {
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

async function cmdVoices() {
  const config = loadConfig();

  if (config.provider === 'azure') {
    console.log('\n🎤 Azure Speech voices:\n');
    try {
      const voices = await fetchProviderVoices();
      const current = config.azureVoice;
      for (const v of voices) {
        const marker = v.name === current ? ' (current)' : '';
        console.log(`  ${v.name.padEnd(35)} ${v.displayName.padEnd(20)} ${v.locale.padEnd(8)} ${v.gender}${marker}`);
      }
      console.log(`\nTotal: ${voices.length} voices`);
    } catch (err) {
      console.error(`  ✗ Failed to fetch voices: ${err.message}`);
    }
  } else if (config.provider === 'kokoro') {
    console.log('\n🎤 Kokoro voices (local):\n');
    try {
      const voices = await fetchProviderVoices();
      const current = config.kokoroVoice;
      for (const v of voices) {
        const marker = v.name === current ? ' (current)' : '';
        console.log(`  ${v.name.padEnd(16)} ${v.grade.padEnd(4)} ${v.gender.padEnd(8)} ${v.locale}  ${v.traits}${marker}`);
      }
      console.log(`\nTotal: ${voices.length} voices`);
    } catch (err) {
      console.error(`  ✗ Failed to list voices: ${err.message}`);
    }
  } else {
    console.log('\n🎤 Gemini voices:\n');
    for (const v of VOICES) {
      const marker = v.name === config.voice ? ' (current)' : '';
      console.log(`  ${v.name.padEnd(18)} ${v.character}${marker}`);
    }
  }
  console.log(`\nChange with: voice-code setup\n`);
}

async function cmdUninstall() {
  console.log('\n🗑️  Voice Code Uninstall\n');

  const confirmed = await confirm({
    message: 'Remove hook from Claude Code and delete all config?',
    default: false,
  });

  if (!confirmed) {
    console.log('  Cancelled.');
    return;
  }

  // Remove hook from Claude settings
  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, 'utf8'));
      if (settings.hooks?.MessageDisplay) {
        settings.hooks.MessageDisplay = settings.hooks.MessageDisplay.filter((group) =>
          !group.hooks?.some((h) => h.command?.includes('tts-bridge'))
        );
        if (settings.hooks.MessageDisplay.length === 0) {
          delete settings.hooks.MessageDisplay;
        }
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
        writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + '\n');
        console.log('  ✓ Hook removed from ~/.claude/settings.json');
      }
    } catch (err) {
      console.error('  ✗ Failed to update settings:', err.message);
    }
  }

  // Delete config directory
  try {
    const { rmSync } = await import('node:fs');
    if (existsSync(CONFIG_DIR)) {
      rmSync(CONFIG_DIR, { recursive: true, force: true });
      console.log('  ✓ Deleted ~/.voice-code/');
    }
  } catch (err) {
    console.error('  ✗ Failed to delete config:', err.message);
  }

  // Clean up temp files
  try {
    const tempDir = join(tmpdir(), 'voice-code');
    const { rmSync } = await import('node:fs');
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
      console.log('  ✓ Cleaned up temp files');
    }
  } catch {}

  console.log('\n✅ Voice Code uninstalled.');
  console.log('   You can now remove the package: pnpm remove -g @vegetz/voice-code\n');
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
    cmdVoices().catch(handleError);
    break;
  case 'log':
    cmdLog(args[0]);
    break;
  case 'uninstall':
    cmdUninstall().catch(handleError);
    break;
  default:
    console.log(`
🎤 Voice Code — Text-to-speech for Claude Code

Providers: Gemini (Google), Azure Speech (Microsoft), Kokoro (Local, free)

Usage:
  voice-code setup          Guided setup wizard (choose provider & voice)
  voice-code on             Enable TTS
  voice-code off            Disable TTS
  voice-code toggle         Toggle TTS
  voice-code test [text]    Test TTS
  voice-code voices         List voices
  voice-code uninstall      Remove hook and config
  voice-code log [n]        Show last n log entries (default 30)
`);
}

function handleError(err) {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
}
