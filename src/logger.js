import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.voice-code');
const LOG_FILE = join(LOG_DIR, 'voice-code.log');

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function write(level, component, message, data) {
  const line = data
    ? `[${timestamp()}] [${level}] [${component}] ${message} ${JSON.stringify(data)}\n`
    : `[${timestamp()}] [${level}] [${component}] ${message}\n`;

  try {
    appendFileSync(LOG_FILE, line);
  } catch {}
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
