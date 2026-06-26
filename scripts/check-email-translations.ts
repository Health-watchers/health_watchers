#!/usr/bin/env ts-node
/**
 * CI check: verifies every send* function in email.service.ts has French (FR) support.
 *
 * A function "has FR support" when its source contains `resolveLanguage` or
 * the literal string `'fr'`/`"fr"` used for language branching, matching the
 * established pattern used throughout email.service.ts.
 *
 * Exit 1 if any send* function lacks FR support — fails the CI pipeline.
 */

import fs from 'fs';
import path from 'path';

const EMAIL_SERVICE_PATH = path.resolve(
  __dirname,
  '../apps/api/src/lib/email.service.ts',
);

const src = fs.readFileSync(EMAIL_SERVICE_PATH, 'utf8');

// Extract each exported send* function's source block.
// We match from `export function send...` to the closing `}` at column 0.
const functionBlocks = new Map<string, string>();

const exportFnRe = /^export function (send\w+)\s*\([^)]*\)(?::\s*\S+)?\s*\{/gm;
let match: RegExpExecArray | null;

while ((match = exportFnRe.exec(src)) !== null) {
  const name = match[1];
  const start = match.index;

  // Find the opening paren of the parameter list, then skip past the
  // matching closing paren to avoid counting type-literal braces as the
  // function body opener.
  let parenDepth = 0;
  let parenDone = false;
  let bodyDepth = 0;
  let bodyStarted = false;
  let i = start + match[0].length - 1; // points just before the '('

  for (; i < src.length; i++) {
    const ch = src[i];
    if (!parenDone) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') { parenDepth--; if (parenDepth === 0) parenDone = true; }
    } else {
      // After the param list: next '{' is the function body
      if (ch === '{') { bodyDepth++; bodyStarted = true; }
      else if (ch === '}' && bodyStarted) {
        bodyDepth--;
        if (bodyDepth === 0) {
          functionBlocks.set(name, src.slice(start, i + 1));
          break;
        }
      }
    }
  }
}

// A function has FR support if it uses resolveLanguage, branches on 'fr'/"fr",
// delegates to renderTemplate (which handles lang selection internally), or
// delegates to another send* function (e.g. deprecated aliases).
function hasFrenchSupport(body: string): boolean {
  return (
    /resolveLanguage/.test(body) ||
    /['"]fr['"]/.test(body) ||
    /isFrench/.test(body) ||
    /renderTemplate/.test(body) ||
    /send[A-Z]\w+Email\(/.test(body) // delegates to another send* function
  );
}

const missing: string[] = [];
const present: string[] = [];

for (const [name, body] of functionBlocks) {
  if (hasFrenchSupport(body)) {
    present.push(name);
  } else {
    missing.push(name);
  }
}

console.log(`\n✅ ${present.length} send* function(s) have French support:`);
present.forEach((n) => console.log(`   ✓ ${n}`));

if (missing.length > 0) {
  console.error(`\n❌ ${missing.length} send* function(s) are missing French (FR) support:`);
  missing.forEach((n) => console.error(`   ✗ ${n}`));
  console.error(
    '\nFix: add a `language?: string` parameter and use `resolveLanguage(language)` to branch between EN/FR content.',
  );
  process.exit(1);
}

console.log('\n✅ All email send* functions have French translation support.');
