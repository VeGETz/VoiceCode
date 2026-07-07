import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.voice-code');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  voice: 'Kore',
  model: 'gemini-3.1-flash-tts-preview',
  enabled: true,
  playbackDevice: null,    // null = auto-detect
  apiKeyEnv: 'GEMINI_API_KEY',  // env var name to read key from
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

export { CONFIG_DIR, CONFIG_FILE, DEFAULTS };
