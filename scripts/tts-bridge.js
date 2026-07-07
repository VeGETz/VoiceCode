#!/usr/bin/env node

/**
 * Voice Code TTS Bridge
 *
 * Receives streaming text from Claude Code's MessageDisplay hook via stdin.
 * Each stdin line is a JSON object with a "delta" field.
 *
 * Multiple bridge invocations share a single queue file and lock file.
 * Only one worker runs at a time. If a worker is already running,
 * new sentences are appended to the queue and the existing worker
 * will pick them up.
 */

import { cleanForSpeech, splitChunks } from '../src/text-cleaner.js';
import { loadConfig } from '../src/config.js';
import { log } from '../src/logger.js';
import { exec } from 'node:child_process';
import { writeFileSync, appendFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const COMPONENT = 'bridge';

let config;
try {
  config = loadConfig();
} catch {
  process.exit(0);
}

if (!config.enabled) {
  process.exit(0);
}

const TEMP_DIR = join(tmpdir(), 'voice-code');
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

// Shared queue and lock files (same across all bridge invocations)
const QUEUE_FILE = join(TEMP_DIR, 'queue.txt');
const LOCK_FILE = join(TEMP_DIR, 'worker.lock');

let buffer = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  const trimmed = chunk.trim();
  if (!trimmed) return;

  let delta;
  try {
    const parsed = JSON.parse(trimmed);
    delta = parsed.delta;
  } catch {
    delta = trimmed;
  }

  if (!delta) return;

  buffer += delta;
  extractAndQueue();
});

process.stdin.on('end', () => {
  // Flush remaining text
  if (buffer.trim()) {
    const cleaned = cleanForSpeech(buffer);
    if (cleaned && cleaned.length > 3) {
      appendFileSync(QUEUE_FILE, cleaned + '\n');
    }
    buffer = '';
  }

  // Try to spawn worker (lock prevents duplicates)
  spawnWorker();
});

process.stdin.on('error', (err) => {
  log.error(COMPONENT, 'stdin error', { error: err.message });
});

// Target chunk size in characters — balances natural speech flow vs API round-trips
const TARGET_CHARS = 300;

function extractAndQueue() {
  const cleaned = cleanForSpeech(buffer);
  if (!cleaned) return;

  const chunks = splitChunks(cleaned, TARGET_CHARS);

  // Need at least 2 chunks to know the first is complete
  if (chunks.length >= 2) {
    const complete = chunks.slice(0, -1);
    for (const chunk of complete) {
      if (chunk.length > 5) {
        log.info(COMPONENT, 'Queued', { chars: chunk.length, text: chunk.slice(0, 100) });
        appendFileSync(QUEUE_FILE, chunk + '\n');
      }
    }

    // Store remainder as the new buffer (already cleaned, avoids mismatch)
    buffer = chunks[chunks.length - 1];
  }
}

function spawnWorker() {
  // If lock exists, a worker is already running — it will process new sentences
  if (existsSync(LOCK_FILE)) {
    log.info(COMPONENT, 'Worker already running, sentences queued');
    return;
  }

  // Create lock file
  writeFileSync(LOCK_FILE, String(process.pid));

  const workerPath = join(import.meta.dirname, 'tts-worker.js');
  const logFile = join(homedir(), '.voice-code', 'voice-code.log');
  const cmd = `nohup node "${workerPath}" "${QUEUE_FILE}" "${LOCK_FILE}" >> "${logFile}" 2>&1 &`;

  exec(cmd, (err) => {
    if (err) {
      log.error(COMPONENT, 'Worker spawn failed', { error: err.message });
      try { unlinkSync(LOCK_FILE); } catch {}
    }
  });
}
