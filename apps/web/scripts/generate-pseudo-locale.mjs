#!/usr/bin/env node
/**
 * Pseudo-locale generator
 * =======================
 * Builds messages/en-XA.json from messages/en.json so layout and i18n bugs show
 * up in development before real Hausa, Yoruba or Portuguese strings land:
 *
 *   "Save changes" -> "[Šåṽé çĥåñĝéš ·····]"
 *
 *   - Every ASCII letter is accented, so any plain-ASCII text left on screen
 *     is a hard-coded literal that bypasses next-intl.
 *   - Each message is padded by ~40 % to mimic longer translations.
 *   - Brackets mark both ends of a string, so a missing "]" means truncation.
 *
 * ICU placeholders ({name}), plural/select keys, `#` and rich-text tags
 * (<b>…</b>) are preserved verbatim so messages still format correctly.
 *
 * Runs automatically before `npm run dev` (predev). The output is gitignored and
 * the locale is only enabled when NODE_ENV=development (see i18n.config.ts).
 *
 *   Usage:
 *     node scripts/generate-pseudo-locale.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.resolve(__dirname, '../messages');
const SOURCE_FILE = path.join(MESSAGES_DIR, 'en.json');
const TARGET_FILE = path.join(MESSAGES_DIR, 'en-XA.json');

const PADDING_RATIO = 0.4;
const PADDING_CHAR = '·';

const ACCENTS = {
  a: 'å', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î',
  j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ',
  s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î',
  J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ', N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ',
  S: 'Ŝ', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

const BRANCHING_TYPES = new Set(['plural', 'select', 'selectordinal']);

/** Index of the `}` that closes the `{` at `start`. */
function findClosingBrace(message, start) {
  let depth = 0;
  for (let i = start; i < message.length; i++) {
    if (message[i] === '{') depth++;
    else if (message[i] === '}' && --depth === 0) return i;
  }
  throw new Error(`Unbalanced braces in message: ${message}`);
}

/**
 * Rewrite an ICU argument body (the text between `{` and `}`). Simple
 * arguments are kept as-is; plural/select branches are pseudo-localised.
 */
function transformArgument(body) {
  const [, type] = body.split(',').map((part) => part.trim());
  if (!BRANCHING_TYPES.has(type)) return body;

  const optionsStart = body.indexOf(',', body.indexOf(',') + 1) + 1;
  let result = body.slice(0, optionsStart);
  let i = optionsStart;
  while (i < body.length) {
    if (body[i] === '{') {
      const end = findClosingBrace(body, i);
      result += `{${transformText(body.slice(i + 1, end))}}`;
      i = end + 1;
    } else {
      result += body[i++];
    }
  }
  return result;
}

/** Accent literal text while leaving ICU syntax and rich-text tags intact. */
function transformText(message) {
  let result = '';
  let i = 0;
  while (i < message.length) {
    const char = message[i];
    if (char === '{') {
      const end = findClosingBrace(message, i);
      result += `{${transformArgument(message.slice(i + 1, end))}}`;
      i = end + 1;
    } else if (char === '<') {
      const end = message.indexOf('>', i);
      if (end === -1) {
        result += char;
        i++;
      } else {
        result += message.slice(i, end + 1);
        i = end + 1;
      }
    } else {
      result += ACCENTS[char] ?? char;
      i++;
    }
  }
  return result;
}

/** Number of characters a reader sees, ignoring ICU arguments and tags. */
function visibleLength(message) {
  return message.replace(/\{[^{}]*\}/g, '').replace(/<[^>]+>/g, '').length;
}

export function pseudoLocalize(message) {
  if (message.trim() === '') return message;
  const padding = PADDING_CHAR.repeat(Math.ceil(visibleLength(message) * PADDING_RATIO));
  return `[${transformText(message)}${padding ? ` ${padding}` : ''}]`;
}

function pseudoLocalizeTree(node) {
  if (typeof node === 'string') return pseudoLocalize(node);
  if (Array.isArray(node)) return node.map(pseudoLocalizeTree);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, pseudoLocalizeTree(value)]),
    );
  }
  return node;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  fs.writeFileSync(TARGET_FILE, `${JSON.stringify(pseudoLocalizeTree(source), null, 2)}\n`);
  console.log(`Pseudo-locale written to ${path.relative(process.cwd(), TARGET_FILE)}`);
}
