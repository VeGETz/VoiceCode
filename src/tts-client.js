import { GoogleGenAI } from '@google/genai';
import { getApiKey, loadConfig } from './config.js';
import { log } from './logger.js';
import { synthesize as azureSynthesize, listVoices as azureListVoices } from './tts-client-azure.js';

let kokoroClient = null;

// kokoro-js pulls in @huggingface/transformers, which can fail to resolve
// under pnpm's strict node_modules (see onnxruntime-common issue). Load it
// lazily so non-Kokoro users never hit that import.
async function getKokoroClient() {
  if (!kokoroClient) {
    kokoroClient = await import('./tts-client-kokoro.js');
  }
  return kokoroClient;
}

let clientInstance = null;

function getClient() {
  if (!clientInstance) {
    clientInstance = new GoogleGenAI({ apiKey: getApiKey() });
  }
  return clientInstance;
}

// Director's note prompt for natural, conversational TTS
const DIRECTOR_NOTE = `Read the following transcript based on the director's note.

# Director's note
Style: The "Vocal Smile": The soft palate is raised to keep the tone bright, sunny, and explicitly inviting. Pace: Fast, energetic, no dead air. Sentences overlap slightly.

## Transcript:`;

/**
 * Synthesize text to audio. Routes to the configured provider (Gemini, Azure, or Kokoro).
 * Returns Buffer of WAV audio (PCM, mono, 24kHz, 16-bit).
 */
export async function synthesize(text, options = {}) {
  const config = loadConfig();

  if (options.provider === 'azure' || config.provider === 'azure') {
    return azureSynthesize(text, options);
  }

  if (options.provider === 'kokoro' || config.provider === 'kokoro') {
    const { synthesize: kokoroSynthesize } = await getKokoroClient();
    return kokoroSynthesize(text, options);
  }

  return synthesizeGemini(text, options);
}

/**
 * List available voices for the configured provider.
 */
export async function listVoices() {
  const config = loadConfig();
  if (config.provider === 'azure') {
    return azureListVoices();
  }
  if (config.provider === 'kokoro') {
    const { listVoices: kokoroListVoices } = await getKokoroClient();
    return kokoroListVoices();
  }
  return null; // Gemini voices are hardcoded in the CLI
}

/**
 * Synthesize text to audio using Gemini TTS with streaming.
 * Concatinates all audio chunks into a single WAV buffer.
 * Returns Buffer of WAV audio (PCM, mono, 24kHz, 16-bit).
 */
async function synthesizeGemini(text, options = {}) {
  const config = loadConfig();
  const client = getClient();

  const voice = options.voice || config.voice || 'Kore';
  const model = options.model || config.model || 'gemini-3.1-flash-tts-preview';

  // Build the prompt with director's note
  const prompt = `${DIRECTOR_NOTE}\n${text}`;

  log.info('tts', 'Synthesizing', { text: text.slice(0, 100), voice, model });

  // Use streaming API and concatenate all audio chunks
  const response = await client.models.generateContentStream({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 1,
      responseModalities: ['audio'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
    },
  });

  // Collect all audio chunks
  const audioChunks = [];
  let mimeType = '';

  for await (const chunk of response) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;

    for (const part of parts) {
      if (part.inlineData?.data) {
        mimeType = part.inlineData.mimeType || mimeType;
        audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
      }
    }
  }

  if (audioChunks.length === 0) {
    log.error('tts', 'No audio data in response');
    throw new Error('No audio data in Gemini TTS response');
  }

  // Concatenate all PCM chunks into one buffer
  const rawPcm = Buffer.concat(audioChunks);

  log.info('tts', 'Audio received', { mimeType, chunks: audioChunks.length, totalBytes: rawPcm.length });

  // If already WAV, return as-is
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') {
    return rawPcm;
  }

  // Parse mimeType and convert PCM to WAV
  const wavOptions = parseMimeType(mimeType);
  return pcmToWav(rawPcm, wavOptions);
}

/**
 * Parse mimeType like "audio/l16; rate=24000; channels=1"
 * into { numChannels, sampleRate, bitsPerSample }
 */
function parseMimeType(mimeType) {
  const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
  const [_, format] = fileType.split('/');

  const options = {
    numChannels: 1,
    sampleRate: 24000,
    bitsPerSample: 16,
  };

  if (format && format.startsWith('L')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim());
    if (key === 'rate') {
      options.sampleRate = parseInt(value, 10);
    } else if (key === 'channels') {
      options.numChannels = parseInt(value, 10);
    }
  }

  return options;
}

/**
 * Wrap raw PCM data in a WAV header.
 */
function pcmToWav(pcmData, options = {}) {
  const {
    numChannels = 1,
    sampleRate = 24000,
    bitsPerSample = 16,
  } = options;

  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);         // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);

  return buffer;
}

/**
 * Reset the client (e.g., after config change).
 */
export function resetClient() {
  clientInstance = null;
  kokoroClient?.resetClient();
}
