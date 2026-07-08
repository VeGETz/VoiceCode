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

import { cleanForSpeech, splitChunks, hasUnclosedCodeFence } from '../src/text-cleaner.js';
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
  // Flush remaining text (skip if still inside a code block)
  if (buffer.trim() && !hasUnclosedCodeFence(buffer)) {
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
  // Don't process while inside an incomplete code fence — wait for closing ```
  if (hasUnclosedCodeFence(buffer)) return;

  // Find the last sentence boundary in the raw buffer.
  // Only process text up to that boundary; the rest may be incomplete.
  const lastBoundary = findLastSentenceBoundary(buffer);
  if (lastBoundary < 0) return;

  const rawComplete = buffer.slice(0, lastBoundary + 1);
  buffer = buffer.slice(lastBoundary + 1);

  const cleaned = cleanForSpeech(rawComplete);
  if (!cleaned || cleaned.length < 3) return;

  const chunks = splitChunks(cleaned, TARGET_CHARS);
  for (const chunk of chunks) {
    if (chunk.length > 5) {
      log.info(COMPONENT, 'Queued', { chars: chunk.length, text: chunk.slice(0, 100) });
      appendFileSync(QUEUE_FILE, chunk + '\n');
    }
  }
}

/**
 * Find the index of the last sentence boundary in raw text.
 * A boundary is ., !, or ? followed by whitespace, newline, or end-of-string.
 * Returns -1 if no boundary found.
 */
function findLastSentenceBoundary(text) {
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    if (/[.!?]/.test(text[i])) {
      const next = text[i + 1];
      if (!next || /[\s\n]/.test(next)) {
        last = i;
      }
    }
  }
  return last;
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
