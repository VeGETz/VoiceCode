import { loadConfig, getAzureCredentials } from './config.js';
import { log } from './logger.js';

const COMPONENT = 'azure-tts';

/**
 * Synthesize text to audio using Azure Speech REST API.
 * Returns Buffer of WAV audio (PCM, mono, 24kHz, 16-bit).
 */
export async function synthesize(text, options = {}) {
  const config = loadConfig();
  const { key, region } = getAzureCredentials();

  const voice = options.voice || config.azureVoice || 'en-US-JennyNeural';

  // Build SSML
  const ssml = buildSsml(text, voice);

  log.info(COMPONENT, 'Synthesizing', { text: text.slice(0, 100), voice, region });

  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
      'User-Agent': 'voice-code',
    },
    body: ssml,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    log.error(COMPONENT, 'Azure TTS request failed', {
      status: response.status,
      statusText: response.statusText,
      body: errBody.slice(0, 500),
    });
    throw new Error(`Azure TTS error ${response.status}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const wavBuffer = Buffer.from(arrayBuffer);

  log.info(COMPONENT, 'Audio received', { bytes: wavBuffer.length });

  return wavBuffer;
}

/**
 * Fetch available voices from Azure Speech API.
 * Returns array of voice objects with ShortName, DisplayName, Gender, Locale.
 */
export async function listVoices() {
  const { key, region } = getAzureCredentials();

  log.info(COMPONENT, 'Fetching voice list', { region });

  const url = `https://${region}.tts.speech.microsoft.com/tts/cognitiveservices/voices/list`;

  const response = await fetch(url, {
    headers: {
      'Ocp-Apim-Subscription-Key': key,
    },
  });

  if (!response.ok) {
    throw new Error(`Azure voice list error ${response.status}: ${response.statusText}`);
  }

  const voices = await response.json();
  log.info(COMPONENT, 'Voices fetched', { count: voices.length });

  return voices.map(v => ({
    name: v.ShortName,
    displayName: v.DisplayName,
    gender: v.Gender,
    locale: v.Locale,
    localeName: v.LocaleName,
    styles: v.StyleList || [],
  }));
}

/**
 * Build SSML string for Azure TTS.
 */
function buildSsml(text, voice) {
  // Escape XML special characters
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return `<speak version="1.0" xml:lang="en-US">
  <voice xml:lang="en-US" xml:gender="Neutral" name="${voice}">
    ${escaped}
  </voice>
</speak>`;
}
