import { writeFileSync, unlinkSync, mkdirSync, readdirSync, rmdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import player from 'play-sound';
import { loadConfig } from './config.js';
import { log } from './logger.js';

// Detect best audio player — prefer paplay (PulseAudio) over SoX's play
function detectPlayer() {
  const candidates = ['paplay', 'aplay', 'afplay'];
  for (const bin of candidates) {
    try {
      execSync(`which ${bin}`, { stdio: 'ignore' });
      log.info('audio', `Using player: ${bin}`);
      return bin;
    } catch {}
  }
  log.info('audio', 'No preferred player found, using play-sound default');
  return undefined;
}

const audioPlayer = player({ player: detectPlayer() });

const TEMP_DIR = join(tmpdir(), 'voice-code');
let fileCounter = 0;

function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
  return TEMP_DIR;
}

/**
 * Play a WAV buffer asynchronously. Returns immediately.
 * @param {Buffer} wavBuffer - WAV audio data
 * @param {object} options - { device, blocking }
 * @returns {Promise<void>}
 */
export function playAudio(wavBuffer, options = {}) {
  return new Promise((resolve, reject) => {
    const config = loadConfig();
    const device = options.device || config.playbackDevice || undefined;

    // Write to temp file
    const filePath = join(ensureTempDir(), `chunk-${fileCounter++}.wav`);
    writeFileSync(filePath, wavBuffer);

    log.info('audio', 'Playing WAV', { file: filePath, bytes: wavBuffer.length, device });

    const playOptions = {};
    if (device) {
      playOptions.device = device;
    }

    audioPlayer.play(filePath, playOptions, (err) => {
      // Clean up temp file
      try { unlinkSync(filePath); } catch {}

      if (err) {
        log.error('audio', 'Playback failed', { error: err.message, file: filePath });
        console.error('[voice-code] playback error:', err.message);
      } else {
        log.info('audio', 'Playback done', { file: filePath });
      }
      resolve();
    });
  });
}

/**
 * Check if audio playback is available on this system.
 */
export async function checkPlayback() {
  const checks = [];

  // Linux: check for aplay or paplay
  if (process.platform === 'linux') {
    checks.push(checkCommand('aplay --version'));
    checks.push(checkCommand('paplay --version'));
  }
  // macOS: check for afplay
  else if (process.platform === 'darwin') {
    checks.push(checkCommand('afplay --help'));
  }
  // Windows: PowerShell SoundPlayer is always available
  else if (process.platform === 'win32') {
    return { available: true, player: 'powershell' };
  }

  const results = await Promise.allSettled(checks);
  const available = results.some((r) => r.status === 'fulfilled' && r.value);

  return {
    available,
    player: available ? 'auto' : null,
    message: available
      ? 'Audio playback available'
      : 'No audio player found. Install aplay (Linux) or afplay (macOS).',
  };
}

function checkCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (err) => resolve(!err));
  });
}

/**
 * Clean up temp directory.
 */
export function cleanup() {
  try {
    if (existsSync(TEMP_DIR)) {
      for (const file of readdirSync(TEMP_DIR)) {
        unlinkSync(join(TEMP_DIR, file));
      }
      rmdirSync(TEMP_DIR);
    }
  } catch {}
}
