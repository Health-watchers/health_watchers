#!/usr/bin/env ts-node
/**
 * Brings every locale in apps/web/messages in line with en.json (the source of truth):
 *  - keys missing from a locale are added with the English value as a fallback
 *  - keys that no longer exist in en.json are removed
 *  - keys are written in the same order as en.json
 *
 * Every fallback is recorded in messages/pending-translations.json so translators know
 * which strings still need work. A key drops off that list once its value differs from
 * the English source.
 *
 * Usage: npx ts-node scripts/sync-translations.ts
 */
import fs from 'fs';
import path from 'path';

type Messages = { [key: string]: string | Messages };

// Resolved from the script path rather than __dirname so this runs under ts-node (CJS)
// and Node's native TypeScript loader (ESM) alike.
const SCRIPTS_DIR = path.dirname(path.resolve(process.argv[1] ?? 'scripts/x'));
const MESSAGES_DIR = path.resolve(SCRIPTS_DIR, '../apps/web/messages');
const PENDING_PATH = path.join(MESSAGES_DIR, 'pending-translations.json');
const SOURCE_LOCALE = 'en';

function read<T = Messages>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function write(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

interface AlignResult {
  /** Keys that were missing or empty and received the English fallback. */
  filled: string[];
  /** Keys whose existing value is identical to English. */
  identical: string[];
}

/** Rebuilds `target` with the shape and key order of `source`, filling gaps from `source`. */
function align(
  source: Messages,
  target: Messages | undefined,
  prefix: string,
  result: AlignResult
): Messages {
  const out: Messages = {};
  for (const [key, sourceValue] of Object.entries(source)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const targetValue = target?.[key];
    if (typeof sourceValue === 'object') {
      out[key] = align(
        sourceValue,
        typeof targetValue === 'object' ? targetValue : undefined,
        fullKey,
        result
      );
    } else if (typeof targetValue === 'string' && targetValue !== '') {
      out[key] = targetValue;
      if (targetValue === sourceValue) result.identical.push(fullKey);
    } else {
      out[key] = sourceValue;
      result.filled.push(fullKey);
    }
  }
  return out;
}

const source = read(path.join(MESSAGES_DIR, `${SOURCE_LOCALE}.json`));
const previousPending: Record<string, string[]> = fs.existsSync(PENDING_PATH)
  ? read<Record<string, string[]>>(PENDING_PATH)
  : {};
const pending: Record<string, string[]> = {};

const locales = fs
  .readdirSync(MESSAGES_DIR)
  .filter((f) => /^[a-z]{2}\.json$/.test(f))
  .map((f) => f.replace('.json', ''))
  .filter((l) => l !== SOURCE_LOCALE)
  .sort();

for (const locale of locales) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  const result: AlignResult = { filled: [], identical: [] };
  write(file, align(source, read(file), '', result));

  // Values identical to English stay pending only if they were a fallback before.
  // Words like "Status" or "ID" can legitimately match the English source.
  const wasPending = new Set(previousPending[locale] ?? []);
  const stillPending = result.identical.filter((k) => wasPending.has(k));
  const keys = [...new Set([...stillPending, ...result.filled])];
  if (keys.length) pending[locale] = keys;
  console.log(`${locale}: ${result.filled.length} filled, ${keys.length} awaiting translation`);
}

write(PENDING_PATH, pending);
console.log(`\nPending list written to ${path.relative(process.cwd(), PENDING_PATH)}`);
