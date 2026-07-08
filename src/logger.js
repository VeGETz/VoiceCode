import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.voice-code');
const LOG_FILE = join(LOG_DIR, 'voice-code.log');

// Rotate when log exceeds 1MB, keep last 500 lines
const MAX_LOG_BYTES = 1 * 1024 * 1024;
const KEEP_LINES = 500;
let writeCount = 0;
const ROTATE_CHECK_INTERVAL = 50;

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function rotateIfNeeded() {
  try {
    if (!existsSync(LOG_FILE)) return;
    const { size } = statSync(LOG_FILE);
    if (size < MAX_LOG_BYTES) return;

    const lines = readFileSync(LOG_FILE, 'utf8').split('\n');
    const trimmed = lines.slice(-KEEP_LINES).join('\n');
    writeFileSync(LOG_FILE, trimmed + '\n');
  } catch {}
}

function write(level, component, message, data) {
  const line = data
    ? `[${timestamp()}] [${level}] [${component}] ${message} ${JSON.stringify(data)}\n`
    : `[${timestamp()}] [${level}] [${component}] ${message}\n`;

  try {
    appendFileSync(LOG_FILE, line);
  } catch {}

  if (++writeCount % ROTATE_CHECK_INTERVAL === 0) {
    rotateIfNeeded();
  }
}

export const log = {
  info(component, message, data) {
    write('INFO', component, message, data);
  },
  error(component, message, data) {
    write('ERROR', component, message, data);
  },
  debug(component, message, data) {
    write('DEBUG', component, message, data);
  },
  warn(component, message, data) {
    write('WARN', component, message, data);
  },
};

export { LOG_FILE };
