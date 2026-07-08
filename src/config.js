import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.voice-code');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  provider: 'gemini',            // 'gemini', 'azure', or 'kokoro'
  voice: 'Kore',
  model: 'gemini-3.1-flash-tts-preview',
  enabled: true,
  playbackDevice: null,          // null = auto-detect
  apiKeyEnv: 'GEMINI_API_KEY',   // env var name to read key from
  azureKey: null,                // Azure Speech resource key
  azureRegion: null,             // Azure region (e.g., 'eastus')
  azureVoice: 'en-US-JennyNeural', // Azure default voice
  kokoroVoice: 'af_heart',      // Kokoro default voice
  kokoroDtype: 'q8',            // Quantization: fp32, fp16, q8, q4, q4f16
};

export function getConfigPath() {
  return CONFIG_FILE;
}

export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(updates) {
  const current = loadConfig();
  const merged = { ...current, ...updates };

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

export function getApiKey() {
  const config = loadConfig();
  // Priority: env var > config file
  const key = process.env[config.apiKeyEnv] || config.apiKey;
  if (!key) {
    throw new Error(
      `API key not found. Set ${config.apiKeyEnv} env var or run: voice-code setup`
    );
  }
  return key;
}

export function getAzureCredentials() {
  const config = loadConfig();
  const key = process.env.AZURE_SPEECH_KEY || config.azureKey;
  const region = process.env.AZURE_SPEECH_REGION || config.azureRegion;
  if (!key || !region) {
    throw new Error(
      'Azure Speech credentials not found. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION env vars, or run: voice-code setup'
    );
  }
  return { key, region };
}

export { CONFIG_DIR, CONFIG_FILE, DEFAULTS };
