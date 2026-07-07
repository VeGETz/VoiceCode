import { Marked } from 'marked';

// Custom renderer that strips code blocks and cleans inline elements
const renderer = {
  code({ text }) {
    // Skip code blocks entirely
    return '';
  },
  codespan({ text }) {
    // Keep inline code content, drop backticks
    return text;
  },
  link({ href, tokens }) {
    // Keep link text, drop URL
    return this.parser.parseInline(tokens);
  },
  image() {
    // Skip images entirely
    return '';
  },
  heading({ tokens }) {
    return this.parser.parseInline(tokens) + '. ';
  },
  paragraph({ tokens }) {
    return this.parser.parseInline(tokens) + ' ';
  },
  list({ tokens }) {
    return this.parser.parse(tokens);
  },
  listitem({ tokens }) {
    return this.parser.parseInline(tokens) + '. ';
  },
  blockquote({ tokens }) {
    return this.parser.parse(tokens);
  },
  strong({ tokens }) {
    return this.parser.parseInline(tokens);
  },
  em({ tokens }) {
    return this.parser.parseInline(tokens);
  },
  del({ tokens }) {
    // Skip strikethrough — not useful spoken
    return '';
  },
  hr() {
    return '';
  },
  table({ tokens }) {
    // Skip tables — not useful spoken
    return '';
  },
  html() {
    return '';
  },
};

const marked = new Marked({ renderer });

/**
 * Convert markdown to speech-ready plain text.
 * - Strips fenced code blocks
 * - Keeps inline code content (drops backticks)
 * - Removes URLs, images, HTML
 * - Repairs sentence flow after removals
 */
export function cleanForSpeech(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';

  // Parse markdown through marked with custom renderer
  let text = marked.parse(markdown);

  // Post-processing cleanup
  text = stripHtmlTags(text);
  text = decodeHtmlEntities(text);
  text = cleanUrls(text);
  text = cleanFilePaths(text);
  text = expandAcronyms(text);
  text = expandSymbols(text);
  text = repairFlow(text);

  return text.trim();
}

function stripHtmlTags(text) {
  // Safety net: remove any remaining HTML tags
  return text.replace(/<[^>]+>/g, '');
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function cleanUrls(text) {
  return text
    .replace(/https?:\/\/[^\s<>"')\]]+/gi, 'link')
    .replace(/www\.[^\s<>"')\]]+/gi, 'link');
}

function cleanFilePaths(text) {
  // Convert long file paths to just the filename
  return text.replace(/(?:\/[\w.-]+){2,}/g, (match) => {
    const parts = match.split('/');
    return parts[parts.length - 1];
  });
}

function expandAcronyms(text) {
  const map = {
    API: 'A P I',
    URL: 'U R L',
    HTTP: 'H T T P',
    HTTPS: 'H T T P S',
    JSON: 'J-S-O-N',
    HTML: 'H T M L',
    CSS: 'C-S-S',
    SQL: 'S-Q-L',
    CLI: 'C-L-I',
    SSH: 'S-S-H',
    YAML: 'Y-A-M-L',
  };
  for (const [acr, spoken] of Object.entries(map)) {
    text = text.replace(new RegExp(`\\b${acr}\\b`, 'g'), spoken);
  }
  return text;
}

function expandSymbols(text) {
  return text
    .replace(/=>/g, ' yields ')
    .replace(/->/g, ' arrow ')
    .replace(/!=/g, ' not equal ')
    .replace(/>=/g, ' greater than or equal ')
    .replace(/<=/g, ' less than or equal ')
    .replace(/===?/g, ' equals ')
    .replace(/&&/g, ' and ')
    .replace(/\|\|/g, ' or ');
}

function repairFlow(text) {
  return text
    // Remove empty lines left by code block removal
    .replace(/\n{3,}/g, '\n\n')
    // Fix orphaned punctuation
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/:\s*\./g, '.')
    // Remove empty parenthetical remnants
    .replace(/\(\s*\)/g, '')
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * Split text into chunks for TTS, targeting a character count.
 *
 * Accumulates text until reaching ~targetChars, then splits at the
 * nearest sentence boundary (. ! ? followed by space/newline).
 * Falls back to splitting at the last space if no sentence boundary
 * is found within the target range.
 *
 * @param {string} text - Input text
 * @param {number} targetChars - Target chunk size in characters (default 300)
 * @returns {string[]} Array of text chunks
 */
export function splitChunks(text, targetChars = 300) {
  if (!text) return [];

  const chunks = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    // Only consider splitting once we've reached the target length
    if (current.length < targetChars) continue;

    const ch = text[i];
    const next = text[i + 1];

    // Priority 1: Sentence boundary (. ! ? followed by space/newline/end)
    if (/[.!?]/.test(ch) && (!next || /[\s\n]/.test(next))) {
      chunks.push(current.trim());
      current = '';
      continue;
    }

    // Priority 2: Line break (single or double newline)
    if (ch === '\n') {
      chunks.push(current.trim());
      current = '';
      if (next === '\n') i++; // skip second newline if double
      continue;
    }
  }

  // Remainder
  const trimmed = current.trim();
  if (trimmed) {
    // If it's very short and we have chunks, merge with the last one
    if (chunks.length > 0 && trimmed.length < targetChars * 0.3) {
      chunks[chunks.length - 1] += ' ' + trimmed;
    } else {
      chunks.push(trimmed);
    }
  }

  return chunks;
}

/**
 * @deprecated Use splitChunks instead
 */
export const splitSentences = splitChunks;
