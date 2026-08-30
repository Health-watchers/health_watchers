#!/usr/bin/env node
/**
 * Mutation Testing Results Analyzer — Issue #1034
 *
 * Reads the Stryker JSON report (reports/mutation/mutation.json) and:
 *  1. Prints a summary per mutated file
 *  2. Lists surviving mutants (weak test areas)
 *  3. Exits with code 1 if the score is below the configured threshold
 *
 * Usage:
 *   node scripts/analyze-mutation-results.js [--report <path>] [--threshold <number>]
 *
 * Options:
 *   --report     Path to mutation.json  (default: reports/mutation/mutation.json)
 *   --threshold  Minimum mutation score (default: 60)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const reportPath = getArg('--report', path.resolve(__dirname, '../reports/mutation/mutation.json'));
const threshold = Number(getArg('--threshold', '60'));

// ── Load report ───────────────────────────────────────────────────────────────
if (!fs.existsSync(reportPath)) {
  console.error(`[mutation-analyzer] Report not found: ${reportPath}`);
  console.error('Run mutation tests first: npm run test:mutation --workspace=api');
  process.exit(0); // non-fatal when no report exists (first run)
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// ── Types ─────────────────────────────────────────────────────────────────────
/**
 * @typedef {{ id: string, status: string, mutatorName: string, location: { start: { line: number, column: number } }, description: string }} MutantResult
 * @typedef {{ source: string, mutants: MutantResult[] }} FileResult
 */

// ── Extract per-file metrics ──────────────────────────────────────────────────
const files = report.files || {};
const summary = {
  totalMutants: 0,
  killed: 0,
  survived: 0,
  noCoverage: 0,
  timeout: 0,
  ignored: 0,
  runtime: 0,
  compilationError: 0,
  perFile: {},
  survivingMutants: [],
};

for (const [filePath, fileData] of Object.entries(files)) {
  const mutants = /** @type {MutantResult[]} */ (fileData.mutants || []);
  const fileSummary = {
    total: mutants.length,
    killed: 0,
    survived: 0,
    noCoverage: 0,
    timeout: 0,
    score: 0,
  };

  for (const mutant of mutants) {
    summary.totalMutants++;
    switch (mutant.status) {
      case 'Killed':
        fileSummary.killed++;
        summary.killed++;
        break;
      case 'Survived':
        fileSummary.survived++;
        summary.survived++;
        summary.survivingMutants.push({
          file: filePath,
          line: mutant.location?.start?.line,
          column: mutant.location?.start?.column,
          mutator: mutant.mutatorName,
          description: mutant.description || '(no description)',
        });
        break;
      case 'NoCoverage':
        fileSummary.noCoverage++;
        summary.noCoverage++;
        break;
      case 'Timeout':
        fileSummary.timeout++;
        summary.timeout++;
        break;
      case 'Ignored':
        summary.ignored++;
        break;
      case 'RuntimeError':
        summary.runtime++;
        break;
      case 'CompileError':
        summary.compilationError++;
        break;
    }
  }

  const detectedCount = fileSummary.killed + fileSummary.timeout;
  const relevantCount = fileSummary.total - fileSummary.noCoverage - summary.ignored;
  fileSummary.score = relevantCount > 0 ? Math.round((detectedCount / relevantCount) * 100) : 100;

  summary.perFile[filePath] = fileSummary;
}

// ── Global score ──────────────────────────────────────────────────────────────
const detectedTotal = summary.killed + summary.timeout;
const relevantTotal = summary.totalMutants - summary.noCoverage - summary.ignored;
const globalScore = relevantTotal > 0 ? Math.round((detectedTotal / relevantTotal) * 100) : 100;

// ── Print report ──────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log(' MUTATION TESTING ANALYSIS REPORT');
console.log('═══════════════════════════════════════════════════\n');

console.log('Global Score:');
const scoreSymbol = globalScore >= threshold ? '✅' : '❌';
console.log(`  ${scoreSymbol} ${globalScore}% (threshold: ${threshold}%)\n`);

console.log('Totals:');
console.log(`  Total mutants  : ${summary.totalMutants}`);
console.log(`  Killed         : ${summary.killed}`);
console.log(`  Survived       : ${summary.survived}`);
console.log(`  No coverage    : ${summary.noCoverage}`);
console.log(`  Timeout        : ${summary.timeout}`);
console.log(`  Ignored        : ${summary.ignored}`);
console.log();

console.log('Per-file breakdown:');
const rows = Object.entries(summary.perFile)
  .sort(([, a], [, b]) => a.score - b.score) // worst first
  .map(([file, stats]) => {
    const icon = stats.score >= threshold ? '✅' : stats.score >= 50 ? '⚠️ ' : '❌';
    const shortPath = file.replace(process.cwd(), '.').replace(/\\/g, '/');
    return `  ${icon} ${stats.score.toString().padStart(3)}%  ${shortPath}  (killed: ${stats.killed}, survived: ${stats.survived}, noCoverage: ${stats.noCoverage})`;
  });
rows.forEach((r) => console.log(r));
console.log();

// ── Surviving mutants ─────────────────────────────────────────────────────────
if (summary.survivingMutants.length > 0) {
  console.log(
    `Surviving mutants (${summary.survivingMutants.length}) — these indicate weak test areas:`
  );
  summary.survivingMutants.slice(0, 30).forEach((m) => {
    const shortFile = m.file.replace(process.cwd(), '.').replace(/\\/g, '/');
    console.log(`  • ${shortFile}:${m.line}:${m.column}  [${m.mutator}]  ${m.description}`);
  });
  if (summary.survivingMutants.length > 30) {
    console.log(
      `  … and ${summary.survivingMutants.length - 30} more. See ${reportPath} for full list.`
    );
  }
  console.log();
}

// ── Recommendations ───────────────────────────────────────────────────────────
const weakFiles = Object.entries(summary.perFile)
  .filter(([, s]) => s.score < threshold)
  .map(([f]) => f.replace(process.cwd(), '.').replace(/\\/g, '/'));

if (weakFiles.length > 0) {
  console.log('Recommended actions to improve weak areas:');
  weakFiles.forEach((f) => {
    console.log(`  → Add boundary-condition tests for: ${f}`);
  });
  console.log();
}

// ── Exit code ─────────────────────────────────────────────────────────────────
if (globalScore < threshold) {
  console.error(
    `[mutation-analyzer] FAIL: global mutation score ${globalScore}% is below threshold ${threshold}%`
  );
  process.exit(1);
} else {
  console.log(
    `[mutation-analyzer] PASS: global mutation score ${globalScore}% meets threshold ${threshold}%`
  );
  process.exit(0);
}
