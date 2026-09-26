#!/usr/bin/env node
'use strict';

// Token-based code duplication detection (issue #1320 — "duplication
// detection"). Reuses the repo's typescript scanner to tokenize sources and
// finds repeated sequences of >= minTokens shared between at least two files.
//
// Usage:
//   node scripts/quality/analyze-duplication.js
//
// Writes scripts/quality/reports/duplication.json.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORTS = path.join(__dirname, 'reports');
const SOURCES = ['apps/api/src', 'apps/web/src', 'apps/stellar-service/src'];
const MIN_TOKENS = 30;

function collectFiles() {
  const files = [];
  for (const dir of SOURCES) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/\.test\.|\.spec\.|__tests__|\.d\.ts$/.test(full)) continue;
        if (/node_modules|dist|\.next|migrations/.test(full)) continue;
        files.push(full);
      }
    };
    walk(abs);
  }
  return files;
}

function tokenize(text) {
  const tokens = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.ES2022,
    false,
    ts.LanguageVariant.Standard,
    text
  );
  let kind = scanner.scan();
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    const tokenText = scanner.getTokenText();
    switch (kind) {
      case ts.SyntaxKind.WhitespaceTrivia:
      case ts.SyntaxKind.NewLineTrivia:
      case ts.SyntaxKind.SingleLineCommentTrivia:
      case ts.SyntaxKind.MultiLineCommentTrivia:
        break;
      case ts.SyntaxKind.NumericLiteral:
        tokens.push('N');
        break;
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        tokens.push('S');
        break;
      case ts.SyntaxKind.Identifier:
      case ts.SyntaxKind.PrivateIdentifier:
        tokens.push(tokenText.toLowerCase());
        break;
      default:
        tokens.push(scanner.getTokenText());
        break;
    }
    kind = scanner.scan();
  }
  return tokens;
}

// Rolling hash (base 53) of a window.
function hashCode(seq, start, len, base, mod) {
  let h = 0;
  for (let i = 0; i < len; i += 1) {
    let c = 0;
    const s = seq[i];
    if (s.length === 1) c = s.charCodeAt(0);
    else for (let j = 0; j < s.length; j += 1) c = (c * 31 + s.charCodeAt(j)) >>> 0;
    h = (h * base + c + 7) % mod;
  }
  return h;
}

function main() {
  const files = collectFiles();
  const tokenLists = [];
  const filePaths = [];
  for (const file of files) {
    filePaths.push(path.relative(ROOT, file));
    tokenLists.push(tokenize(fs.readFileSync(file, 'utf8')));
  }

  const base = 53;
  const mod = 1_000_000_007;
  const windows = new Map(); // hash -> [{file, start}]
  for (let i = 0; i < tokenLists.length; i += 1) {
    const tokens = tokenLists[i];
    if (tokens.length < MIN_TOKENS) continue;
    for (let s = 0; s + MIN_TOKENS <= tokens.length; s += 1) {
      const h = hashCode(tokens, s, MIN_TOKENS, base, mod);
      if (!windows.has(h)) windows.set(h, []);
      windows.get(h).push({ file: i, start: s });
    }
  }

  const dupFlags = tokenLists.map((t) => new Array(t.length).fill(false));
  const blocks = [];

  for (const [hash, occ] of windows) {
    const distinctFiles = new Set(occ.map((o) => o.file));
    if (distinctFiles.size < 2) continue;

    const first = occ[0];
    const tokens = tokenLists[first.file];
    // Find the longest common run starting at each occurrence.
    let maxLen = MIN_TOKENS;
    let maxPos = first.start;
    for (let s = first.start + MIN_TOKENS; s + MIN_TOKENS <= tokens.length; s += 1) {
      if (hashCode(tokens, s, MIN_TOKENS, base, mod) !== hash) continue;
      // verify token equality to avoid hash collisions, then extend
      if (tokens.slice(s, s + MIN_TOKENS).every((tok, k) => tok === tokens[first.start + k])) {
        let len = MIN_TOKENS;
        while (
          first.start + len < tokens.length &&
          s + len < tokens.length &&
          tokens[first.start + len] === tokens[s + len]
        ) {
          len += 1;
        }
        // greedily prefer the earlier/longer run
        if (len > maxLen) {
          maxLen = len;
          maxPos = first.start;
        }
      }
    }

    // Only treat as a real duplicate if the full run still spans 2+ files.
    const sample = tokens.slice(maxPos, maxPos + maxLen).join(' ');
    const other = occ.find((o) => o.file !== first.file);
    const otherTokens = tokenLists[other.file];
    const ok = otherTokens
      .slice(other.start, other.start + maxLen)
      .every((tok, k) => tok === tokens[maxPos + k]);
    if (!ok) continue;

    const rel = path.relative(ROOT, filePaths[first.file]);
    if (blocks.some((b) => b.file === rel && b.start === maxPos && b.length === maxLen)) continue;

    blocks.push({
      file: rel,
      start: maxPos,
      length: maxLen,
      tokens: maxLen,
      sample: sample.slice(0, 120),
      peerFiles: [...distinctFiles].map((f) => path.relative(ROOT, filePaths[f])).slice(0, 5),
    });

    for (const o of occ) {
      for (let k = 0; k < maxLen && o.start + k < tokenLists[o.file].length; k += 1) {
        dupFlags[o.file][o.start + k] = true;
      }
    }
  }

  const perFile = filePaths.map((p, i) => {
    const total = tokenLists[i].length;
    const dup = dupFlags[i].reduce((s, v) => (v ? s + 1 : s), 0);
    return {
      file: p,
      totalTokens: total,
      duplicatedTokens: dup,
      percent: total ? Number(((dup / total) * 100).toFixed(2)) : 0,
    };
  });

  const totalTokens = perFile.reduce((s, f) => s + f.totalTokens, 0);
  const totalDup = perFile.reduce((s, f) => s + f.duplicatedTokens, 0);
  const totalPercent = totalTokens ? Number(((totalDup / totalTokens) * 100).toFixed(2)) : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    method: 'token-based (typescript scanner, min ' + MIN_TOKENS + ' tokens)',
    totals: {
      files: filePaths.length,
      totalTokens: totalTokens,
      duplicatedTokens: totalDup,
      duplicatePercent: totalPercent,
      aboveThresholdFiles: perFile.filter((f) => f.totalTokens >= MIN_TOKENS && f.percent > 10)
        .length,
      blockCount: blocks.length,
    },
    blocks: blocks.sort((a, b) => b.length - a.length).slice(0, 30),
    files: perFile.sort((a, b) => b.percent - a.percent).slice(0, 30),
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'duplication.json'), JSON.stringify(report, null, 2));
  console.log(
    `duplication: ${report.totals.duplicatePercent}% duplicated, ${report.totals.blockCount} blocks, ${report.totals.aboveThresholdFiles} files >10%`
  );
}

main();
