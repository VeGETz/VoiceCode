import { KokoroTTS } from 'kokoro-js';
import { loadConfig } from './config.js';
import { log } from './logger.js';

const COMPONENT = 'kokoro-tts';
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let ttsInstance = null;

/**
 * Synthesize text to audio using Kokoro TTS.
 * Returns Buffer of WAV audio (PCM, mono, 24kHz, 16-bit).
 */
export async function synthesize(text, options = {}) {
  const config = loadConfig();
  const dtype = options.kokoroDtype || config.kokoroDtype || 'q8';
  const voice = options.voice || config.kokoroVoice || 'af_heart';

  // Load model once, reuse
  if (!ttsInstance) {
    log.info(COMPONENT, 'Loading Kokoro model...', { dtype });
    ttsInstance = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device: 'cpu',
      progress_callback: options.onProgress,
    });
    log.info(COMPONENT, 'Kokoro model loaded');
  }

  log.info(COMPONENT, 'Synthesizing', { text: text.slice(0, 100), voice });

  const result = await ttsInstance.generate(text, { voice });

  // result.audio is a Float32Array, result.sampling_rate is 24000
  const pcm16 = float32ToInt16(result.audio);
  return pcmToWav(pcm16, result.sampling_rate || 24000);
}

/**
 * List available Kokoro voices.
 */
export function listVoices() {
  return AVAILABLE_VOICES;
}

/**
 * Reset the cached model instance.
 */
export function resetClient() {
  ttsInstance = null;
}

// Float32 → Int16 PCM
function float32ToInt16(float32Array) {
  const buffer = Buffer.alloc(float32Array.length * 2);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    buffer.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  return buffer;
}

// Raw PCM → WAV
function pcmToWav(pcmData, sampleRate = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);

  return buffer;
}

export const AVAILABLE_VOICES = [
  { id: 'af_heart',   name: 'Heart',    gender: 'Female', locale: 'en-US', grade: 'A',   traits: 'Warm, natural' },
  { id: 'af_bella',   name: 'Bella',    gender: 'Female', locale: 'en-US', grade: 'A-',  traits: 'Energetic' },
  { id: 'af_nicole',  name: 'Nicole',   gender: 'Female', locale: 'en-US', grade: 'B-',  traits: 'Calm' },
  { id: 'af_kore',    name: 'Kore',     gender: 'Female', locale: 'en-US', grade: 'C+',  traits: 'Firm' },
  { id: 'af_aoede',   name: 'Aoede',    gender: 'Female', locale: 'en-US', grade: 'C+',  traits: 'Breezy' },
  { id: 'af_sarah',   name: 'Sarah',    gender: 'Female', locale: 'en-US', grade: 'C+',  traits: 'Clear' },
  { id: 'af_sky',     name: 'Sky',      gender: 'Female', locale: 'en-US', grade: 'C-',  traits: 'Neutral' },
  { id: 'af_nova',    name: 'Nova',     gender: 'Female', locale: 'en-US', grade: 'C',   traits: 'Modern' },
  { id: 'af_alloy',   name: 'Alloy',    gender: 'Female', locale: 'en-US', grade: 'C',   traits: 'Balanced' },
  { id: 'af_jessica', name: 'Jessica',  gender: 'Female', locale: 'en-US', grade: 'D',   traits: 'Soft' },
  { id: 'af_river',   name: 'River',    gender: 'Female', locale: 'en-US', grade: 'D',   traits: 'Gentle' },
  { id: 'am_fenrir',  name: 'Fenrir',   gender: 'Male',   locale: 'en-US', grade: 'C+',  traits: 'Strong' },
  { id: 'am_puck',    name: 'Puck',     gender: 'Male',   locale: 'en-US', grade: 'C+',  traits: 'Playful' },
  { id: 'am_michael', name: 'Michael',  gender: 'Male',   locale: 'en-US', grade: 'C+',  traits: 'Professional' },
  { id: 'am_echo',    name: 'Echo',     gender: 'Male',   locale: 'en-US', grade: 'D',   traits: 'Resonant' },
  { id: 'am_eric',    name: 'Eric',     gender: 'Male',   locale: 'en-US', grade: 'D',   traits: 'Neutral' },
  { id: 'am_liam',    name: 'Liam',     gender: 'Male',   locale: 'en-US', grade: 'D',   traits: 'Casual' },
  { id: 'am_onyx',    name: 'Onyx',     gender: 'Male',   locale: 'en-US', grade: 'D',   traits: 'Deep' },
  { id: 'am_adam',    name: 'Adam',     gender: 'Male',   locale: 'en-US', grade: 'F+',  traits: 'Basic' },
  { id: 'am_santa',   name: 'Santa',    gender: 'Male',   locale: 'en-US', grade: 'D-',  traits: 'Jolly' },
  { id: 'bf_emma',    name: 'Emma',     gender: 'Female', locale: 'en-GB', grade: 'B-',  traits: 'Refined' },
  { id: 'bf_isabella', name: 'Isabella', gender: 'Female', locale: 'en-GB', grade: 'C',  traits: 'Elegant' },
  { id: 'bf_alice',   name: 'Alice',    gender: 'Female', locale: 'en-GB', grade: 'D',   traits: 'Classic' },
  { id: 'bf_lily',    name: 'Lily',     gender: 'Female', locale: 'en-GB', grade: 'D',   traits: 'Soft' },
  { id: 'bm_george',  name: 'George',   gender: 'Male',   locale: 'en-GB', grade: 'C',   traits: 'Distinguished' },
  { id: 'bm_fable',   name: 'Fable',    gender: 'Male',   locale: 'en-GB', grade: 'C',   traits: 'Storyteller' },
  { id: 'bm_daniel',  name: 'Daniel',   gender: 'Male',   locale: 'en-GB', grade: 'D',   traits: 'Formal' },
  { id: 'bm_lewis',   name: 'Lewis',    gender: 'Male',   locale: 'en-GB', grade: 'D+',  traits: 'Warm' },
];
