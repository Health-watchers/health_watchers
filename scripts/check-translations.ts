#!/usr/bin/env ts-node
/**
 * Verifies that every locale in apps/web/messages has exactly the same keys as en.json,
 * the source of truth. Fails on missing, extra, or empty keys.
 *
 * Keys listed in messages/pending-translations.json still carry an English fallback;
 * they are reported but do not fail the check.
 *
 * To fix drift, run: npx ts-node scripts/sync-translations.ts
 */
import fs from 'fs';
import path from 'path';

// Resolved from the script path rather than __dirname so this runs under ts-node (CJS)
// and Node's native TypeScript loader (ESM) alike.
const SCRIPTS_DIR = path.dirname(path.resolve(process.argv[1] ?? 'scripts/x'));
const MESSAGES_DIR = path.resolve(SCRIPTS_DIR, '../apps/web/messages');
const PENDING_PATH = path.join(MESSAGES_DIR, 'pending-translations.json');
const REPORT_PATH = path.resolve(SCRIPTS_DIR, 'translation-report.json');
const SOURCE_LOCALE = 'en';

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') {
      Object.assign(result, flatten(v as Record<string, unknown>, key));
    } else {
      result[key] = String(v ?? '');
    }
  }
  return result;
}

function load(locale: string): Record<string, string> {
  return flatten(JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf8')));
}

const pending: Record<string, string[]> = fs.existsSync(PENDING_PATH)
  ? JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'))
  : {};

const locales = fs
  .readdirSync(MESSAGES_DIR)
  .filter((f) => /^[a-z]{2}\.json$/.test(f))
  .map((f) => f.replace('.json', ''))
  .sort();

const en = load(SOURCE_LOCALE);
const enKeys = new Set(Object.keys(en));

const report: Record<
  string,
  { missing: string[]; extra: string[]; empty: string[]; pending: number }
> = {};
let failed = false;

for (const locale of locales) {
  const messages = load(locale);
  const keys = new Set(Object.keys(messages));

  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));
  const empty = [...keys].filter((k) => messages[k] === '');
  const pendingCount = pending[locale]?.length ?? 0;

  report[locale] = { missing, extra, empty, pending: pendingCount };

  const ok = !missing.length && !extra.length && !empty.length;
  if (!ok) failed = true;

  console.log(
    `${ok ? '✅' : '❌'} ${locale}: ${keys.size} keys` +
      (pendingCount ? ` (${pendingCount} awaiting translation)` : '')
  );
  missing.forEach((k) => console.log(`    - missing: ${k}`));
  extra.forEach((k) => console.log(`    + extra:   ${k}`));
  empty.forEach((k) => console.log(`    ! empty:   ${k}`));
}

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nReport written to ${REPORT_PATH}`);

if (failed) {
  console.error(
    `\n❌ Locale key sets differ from ${SOURCE_LOCALE}.json. Run scripts/sync-translations.ts to fix.`
  );
  process.exit(1);
}
console.log(`\n✅ All ${locales.length} locales match ${SOURCE_LOCALE}.json.`);
