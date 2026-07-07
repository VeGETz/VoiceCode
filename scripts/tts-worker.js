#!/usr/bin/env node

/**
 * TTS Worker — processes a shared queue file sequentially.
 *
 * Reads sentences from the queue file, synthesizes each via Gemini TTS,
 * and plays them in order. Uses a lock file to prevent multiple workers.
 * After processing all sentences, checks for any new ones added during
 * processing before exiting.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { synthesize } from '../src/tts-client.js';
import { playAudio } from '../src/audio-player.js';
import { log } from '../src/logger.js';

const COMPONENT = 'worker';
const queueFile = process.argv[2];
const lockFile = process.argv[3];

if (!queueFile || !lockFile) {
  log.error(COMPONENT, 'Missing arguments: queueFile, lockFile');
  process.exit(1);
}

log.info(COMPONENT, 'Worker started', { queueFile, lockFile });

try {
  // Process queue in a loop — re-check after each full pass
  // in case new sentences arrived while we were playing
  let passes = 0;
  const MAX_PASSES = 10;

  while (passes < MAX_PASSES) {
    passes++;

    // Read current queue
    if (!existsSync(queueFile)) break;

    const content = readFileSync(queueFile, 'utf8').trim();
    const sentences = content.split('\n').filter(s => s.trim().length > 2);

    if (sentences.length === 0) break;

    log.info(COMPONENT, `Pass ${passes}: processing ${sentences.length} sentences`);

    // Clear the queue file before processing (so new arrivals get added cleanly)
    writeFileSync(queueFile, '');

    // Pipeline: synthesize next sentence while current one plays.
    // Hides the 2-5s synthesis latency behind playback time.

    let nextAudioPromise = null; // Promise<Buffer> for pre-fetched sentence

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;

      try {
        let wavBuffer;

        if (nextAudioPromise) {
          // Use pre-fetched audio (may still be in-flight — await it)
          wavBuffer = await nextAudioPromise;
          nextAudioPromise = null;
        } else {
          // No pre-fetch available, synthesize now
          log.info(COMPONENT, `Synthesizing ${i + 1}/${sentences.length}`, { text: sentence.slice(0, 80) });
          wavBuffer = await synthesize(sentence);
        }

        // Start pre-fetching the next sentence while current one plays
        const nextSentence = sentences[i + 1]?.trim();
        if (nextSentence && nextSentence.length > 2) {
          log.info(COMPONENT, `Pre-fetching ${i + 2}/${sentences.length}`);
          nextAudioPromise = synthesize(nextSentence); // starts immediately, no await
        }

        // Play current sentence (next one synthesizing in parallel)
        log.info(COMPONENT, `Playing ${i + 1}/${sentences.length}`);
        await playAudio(wavBuffer);
        log.info(COMPONENT, 'Done');
      } catch (err) {
        log.error(COMPONENT, 'Error', { error: err.message, text: sentence.slice(0, 80) });
        nextAudioPromise = null;
      }
    }

    // Check if new sentences arrived during processing
    if (existsSync(queueFile)) {
      const newContent = readFileSync(queueFile, 'utf8').trim();
      if (newContent.length === 0) break; // No new sentences
      log.info(COMPONENT, 'New sentences arrived, processing another pass');
    }
  }
} catch (err) {
  log.error(COMPONENT, 'Fatal error', { error: err.message });
} finally {
  // Always clean up lock file
  try { unlinkSync(lockFile); } catch {}
  log.info(COMPONENT, 'Worker exiting, lock released');
}

process.exit(0);
