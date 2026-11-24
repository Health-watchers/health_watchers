#!/usr/bin/env node
'use strict';

// Actionable code-quality improvement suggestions (issue #1320).
//
// Usage: node scripts/quality/suggestions.js
// Writes scripts/quality/reports/suggestions.json and suggestions.md.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const REPORTS = path.join(DIR, 'reports');
const ROOT = path.resolve(DIR, '..', '..');
const MIN_COVERAGE = 60;

function read(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(DIR, rel), 'utf8'));
  } catch {
    return null;
  }
}

const suggestions = [];
const directives = [];
const seen = new Set();

function add(directive, text, { severity = 'info' } = {}) {
  const key = `${directive}:${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  suggestions.push({ severity, directive, text });
  if (directive === 'fix') directives.push(text);
}

function main() {
  const complexity = read('reports/complexity.json');
  const duplication = read('reports/duplication.json');
  const score = read('reports/score.json');

  if (complexity) {
    for (const file of complexity.files || []) {
      for (const fn of file.highRiskFunctions || []) {
        add(
          'fix',
          `Refactor \`${file.file}\` — function \`${fn.name}\` (line ${fn.line}) has cyclomatic complexity ${fn.complexity}. Split it into smaller single-purpose helpers and add early returns.`,
          { severity: 'high' }
        );
      }
    }
    const worst = [...(complexity.files || [])].sort(
      (a, b) => b.avgFunctionComplexity - a.avgFunctionComplexity
    )[0];
    if (worst && worst.avgFunctionComplexity > 8) {
      add(
        'medium',
        `Review \`${worst.file}\` — highest average function complexity (${worst.avgFunctionComplexity}).`,
        { severity: 'medium' }
      );
    }
    if (complexity.totals && complexity.totals.highRiskFiles > 20) {
      add(
        'watch',
        `${complexity.totals.highRiskFiles} files contain functions at or above complexity 15. Set CI complexity budgets (see gate.config.json) before the count grows.`,
        { severity: 'medium' }
      );
    }
  }

  if (duplication) {
    for (const block of (duplication.blocks || []).slice(0, 10)) {
      add(
        'fix',
        `Extract shared code: a ${block.length}-token block in \`${block.file}\` line ${block.start + 1} is duplicated in: ${(block.peerFiles || []).join(', ')}. Pull it into a shared util and export instead of copying.`
      );
    }
    if (duplication.totals && duplication.totals.duplicatePercent > 10) {
      add(
        'watch',
        `Duplication is ${duplication.totals.duplicatePercent}% — above the 10% budget. Prioritise the blocks listed above.`,
        { severity: 'medium' }
      );
    }
  }

  const covApps = ['apps/api', 'apps/web', 'apps/stellar-service'];
  for (const app of covApps) {
    const summary = read(`../../${app}/coverage/coverage-summary.json`);
    if (!summary) continue;
    for (const [file, data] of Object.entries(summary)) {
      if (file === 'total' || !data || !data.lines) continue;
      const { covered, total } = data.lines;
      const pct = total ? (covered / total) * 100 : 100;
      if (pct < MIN_COVERAGE) {
        add(
          'fix',
          `Add tests for \`${file}\` in ${app} — line coverage ${pct.toFixed(0)}% is below the ${MIN_COVERAGE}% budget (${covered}/${total} lines).`
        );
      }
    }
  }
  if (score && score.coverage && score.coverage.total < MIN_COVERAGE) {
    add(
      'watch',
      `Overall line coverage (${score.coverage.total.toFixed(1)}%) is below the ${MIN_COVERAGE}% budget.`,
      { severity: 'high' }
    );
  }

  if (suggestions.length === 0) {
    suggestions.push({
      severity: 'info',
      directive: 'watch',
      text: 'No quality regressions detected. Keep the trend green.',
    });
  }

  const report = { generatedAt: new Date().toISOString(), count: suggestions.length, suggestions };
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'suggestions.json'), JSON.stringify(report, null, 2));

  const md = [
    '## 💡 Quality Improvement Suggestions',
    '',
    ...suggestions.map((s) => `- **[${s.severity}]** ${s.text}`),
    '',
    `_Generated ${report.generatedAt} — ${suggestions.length} suggestions._`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(REPORTS, 'suggestions.md'), md);

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    } catch {}
  }
  console.log(`suggestions: ${suggestions.length} generated`);
}

main();
