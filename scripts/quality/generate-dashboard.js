#!/usr/bin/env node
'use strict';

// Code quality dashboard + gate enforcement (issue #1320).
//
// Usage: node scripts/quality/generate-dashboard.js
//   - Writes scripts/quality/reports/quality-dashboard.html, quality-report.md
//   - Enforces the quality gate (maintainability-score) via exit code
//
// Requires reports from: analyze-complexity, analyze-duplication,
// maintainability-score, suggestions, record-trend.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const REPORTS = path.join(DIR, 'reports');
const HISTORY = path.join(DIR, 'history', 'trend.json');

function read(rel, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(DIR, rel), 'utf8'));
  } catch {
    return fallback;
  }
}

function buildDashboard(score, history, suggestions, complexity, duplication) {
  const g = score.gates;
  const trend = (history.runs || []).slice(-10);
  const rows =
    (trend || [])
      .map(
        (r) =>
          `| ${r.timestamp.slice(0, 10)} | ${r.branch}@${r.commit} | ${r.overall} | ${r.maintainabilityIndex} | ${r.coveragePercent}% | ${r.duplicatePercent}% | ${r.avgFunctionComplexity} | ${r.passed ? '✅' : '❌'} |`
      )
      .join('\n') || '_no history yet_';

  const topComplex =
    (complexity.files || [])
      .filter((f) => f.highRiskFunctions.length)
      .sort((a, b) => b.highRiskFunctions.length - a.highRiskFunctions.length)
      .slice(0, 5)
      .map((f) => `- \`${f.file}\` — ${f.highRiskFunctions.length} function(s) >= 15`)
      .join('\n') || '_none_';

  const topDup =
    (duplication.blocks || [])
      .slice(0, 5)
      .map(
        (b) =>
          `- \`${b.file}\` line ${b.start + 1} (${b.length} tokens) mirrored in ${(b.peerFiles || []).join(', ')}`
      )
      .join('\n') || '_none_';

  return [
    '# 📊 Code Quality Dashboard',
    '',
    `_Generated ${new Date().toISOString()} · branch \`${process.env.GITHUB_REF_NAME || 'local'}\` · commit \`${process.env.GITHUB_SHA || 'local'}\`_`,
    '',
    `## Overall: **${score.overall}/100** — gate **${score.passed ? '✅ PASSED' : '❌ FAILED'}**`,
    '',
    '| Dimension | Value | Gate |',
    '|---|---:|---|',
    `| Maintainability index | ${g.maintainabilityIndex} | ${g.maintainabilityGate ? 'pass' : 'fail'} |`,
    `| Test coverage | ${g.coveragePercent}% | ${g.coverageGate ? 'pass' : 'fail'} |`,
    `| Duplication | ${g.duplicatePercent}% | ${g.duplicationGate ? 'pass' : 'fail'} |`,
    `| Avg function complexity | ${g.avgFunctionComplexity} | ${g.complexityGate ? 'pass' : 'fail'} |`,
    `| High-risk functions | ${g.highRiskFunctions} | ${g.highRiskGate ? 'pass' : 'fail'} |`,
    '',
    '### Coverage by app',
    '',
    (score.coverage.apps || []).map((a) => `- ${a.app}: ${a.percent.toFixed(1)}%`).join('\n') ||
      '_coverage unavailable — run jest --coverage first_',
    '',
    '### Quality trend (last 10 runs)',
    '',
    '| Date | Branch @ commit | Score | MI | Coverage | Dup % | Avg CC | Gate |',
    '|---|---|---:|---:|---:|---:|---:|---|',
    rows,
    '',
    '### Top complexity risks',
    '',
    topComplex,
    '',
    '### Top duplication blocks',
    '',
    topDup,
    '',
    '### Suggestions',
    '',
    (suggestions.suggestions || []).map((s) => `- **[${s.severity}]** ${s.text}`).join('\n') ||
      '_no suggestions_',
    '',
    '## Team improvement',
    '',
    (() => {
      const runs = history.runs || [];
      if (runs.length < 2)
        return '- Only one recorded run so far — the trend needs two+ runs to show direction.';
      const first = runs[0].overall;
      const last = runs[runs.length - 1].overall;
      const delta = last - first;
      const dir = delta > 0 ? '▲ improving' : delta < 0 ? '▼ regressing' : '— stable';
      return `- Score started at **${first}**, now **${last}** (${dir} by ${Math.abs(delta)} point over ${runs.length} runs).`;
    })(),
    '',
  ].join('\n');
}

function main() {
  const score = read('reports/score.json');
  const history = read('history/trend.json', { runs: [] });
  const suggestions = read('reports/suggestions.json', { suggestions: [] });
  const complexity = read('reports/complexity.json', { files: [] });
  const duplication = read('reports/duplication.json', { blocks: [] });

  const md = buildDashboard(score, history, suggestions, complexity, duplication);
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'quality-report.md'), md);

  const htmlContent = md
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^\*\*(.*)\*\*$/gm, '<p><strong>$1</strong></p>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>\n');
  const kpi = (label, value, ok) =>
    `<div class="card"><div class="v ${ok === undefined ? '' : ok ? 'good' : 'bad'}">${value}</div><div class="k">${label}</div></div>`;

  fs.writeFileSync(
    path.join(REPORTS, 'quality-dashboard.html'),
    `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Health Watchers — Code Quality Dashboard</title>
<style>
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;margin:24px;background:#0f172a;color:#e2e8f0}
h1{font-size:20px}h2{font-size:16px;margin-top:26px}h3{font-size:14px}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}.card{background:#1e293b;border-radius:8px;padding:12px 16px;min-width:110px}
.v{font-size:20px;font-weight:700}.k{font-size:11px;color:#94a3b8;text-transform:uppercase}
.good{color:#4ade80}.bad{color:#f87171}.warn{color:#fbbf24}
code{background:#1e293b;padding:1px 4px;border-radius:4px}
pre{white-space:pre-wrap;font-size:13px;line-height:1.6}
</style></head><body>
<div class="cards">
${kpi('Overall score', `${score.overall}/100`, score.passed)}
${kpi('Maintainability', gMaintainability(score), score.gates.maintainabilityGate)}
${kpi('Coverage', `${score.gates.coveragePercent}%`, score.gates.coverageGate)}
${kpi('Duplication', `${score.gates.duplicatePercent}%`, score.gates.duplicationGate)}
</div>
<pre>${htmlContent}</pre>
</body></html>`
  );

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    } catch {}
  }

  console.log(`dashboard: score ${score.overall}/100 — ${score.passed ? 'PASSED' : 'FAILED'}`);
  if (!score.passed) {
    console.error('quality gate: FAILED');
    process.exitCode = 1;
  }
}

function gMaintainability(score) {
  return score.gates.maintainabilityIndex;
}

main();
