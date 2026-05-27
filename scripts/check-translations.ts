#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

const EN_PATH = path.resolve(__dirname, '../apps/web/messages/en.json');
const FR_PATH = path.resolve(__dirname, '../apps/web/messages/fr.json');
const REPORT_PATH = path.resolve(__dirname, 'translation-report.json');

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

const en = flatten(JSON.parse(fs.readFileSync(EN_PATH, 'utf8')));
const fr = flatten(JSON.parse(fs.readFileSync(FR_PATH, 'utf8')));

const enKeys = new Set(Object.keys(en));
const frKeys = new Set(Object.keys(fr));

const missing = [...enKeys].filter((k) => !frKeys.has(k));
const extra = [...frKeys].filter((k) => !enKeys.has(k));
const empty = [...enKeys].filter((k) => frKeys.has(k) && fr[k] === '');

const report = { missing, extra, empty };
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

console.log(`Missing keys (in en, not in fr): ${missing.length}`);
if (missing.length) console.log(missing.map((k) => `  - ${k}`).join('\n'));

console.log(`Extra keys (in fr, not in en): ${extra.length}`);
if (extra.length) console.log(extra.map((k) => `  + ${k}`).join('\n'));

console.log(`Empty values in fr.json: ${empty.length}`);
if (empty.length) console.log(empty.map((k) => `  ! ${k}`).join('\n'));

console.log(`\nReport written to ${REPORT_PATH}`);

if (missing.length > 0 || empty.length > 0) {
  console.error('\n❌ Translation check failed: missing or empty French translations.');
  process.exit(1);
}
console.log('\n✅ All translations are complete.');
