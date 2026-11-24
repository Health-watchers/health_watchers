#!/usr/bin/env node
/**
 * E2E Test Report Dashboard Generator
 *
 * Reads Playwright's JSON reporter output and produces a single static
 * HTML dashboard summarizing pass/fail counts, duration, and flaky tests
 * across all projects (chromium, payment-flow, mobile-ios, mobile-android).
 *
 * Usage:
 *   npx playwright test --reporter=json > e2e-results.json
 *   node e2e/generate-report-dashboard.js e2e-results.json
 */

const fs = require('fs');
const path = require('path');

function loadResults(jsonPath) {
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(raw);
}

function summarize(results) {
  const summary = {
    total: 0,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
    durationMs: results.stats?.duration ?? 0,
    byProject: {},
  };

  const suites = results.suites || [];
  const walk = (suite) => {
    (suite.specs || []).forEach((spec) => {
      spec.tests.forEach((t) => {
        summary.total += 1;
        const status = t.results?.[t.results.length - 1]?.status || 'unknown';
        const project = t.projectName || 'default';
        summary.byProject[project] = summary.byProject[project] || { passed: 0, failed: 0, flaky: 0, skipped: 0 };

        if (status === 'passed') {
          summary.passed += 1;
          summary.byProject[project].passed += 1;
        } else if (status === 'failed' || status === 'timedOut') {
          summary.failed += 1;
          summary.byProject[project].failed += 1;
        } else if (status === 'skipped') {
          summary.skipped += 1;
          summary.byProject[project].skipped += 1;
        }
        if (t.results && t.results.length > 1) {
          summary.flaky += 1;
          summary.byProject[project].flaky += 1;
        }
      });
    });
    (suite.suites || []).forEach(walk);
  };
  suites.forEach(walk);
  return summary;
}

function renderHtml(summary) {
  const rows = Object.entries(summary.byProject)
    .map(
      ([project, s]) =>
        `<tr><td>${project}</td><td>${s.passed}</td><td>${s.failed}</td><td>${s.flaky}</td><td>${s.skipped}</td></tr>`
    )
    .join('\n');

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>E2E Test Report</title>
<style>
  body { font-family: sans-serif; margin: 2rem; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 0.5rem; text-align: left; }
  .pass { color: green; } .fail { color: red; }
</style>
</head>
<body>
  <h1>E2E Test Report Dashboard</h1>
  <p>Total: ${summary.total} | <span class="pass">Passed: ${summary.passed}</span> | <span class="fail">Failed: ${summary.failed}</span> | Flaky: ${summary.flaky} | Skipped: ${summary.skipped}</p>
  <p>Duration: ${(summary.durationMs / 1000).toFixed(1)}s</p>
  <table>
    <thead><tr><th>Project</th><th>Passed</th><th>Failed</th><th>Flaky</th><th>Skipped</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node generate-report-dashboard.js <playwright-json-results>');
    process.exit(1);
  }
  const results = loadResults(inputPath);
  const summary = summarize(results);
  const html = renderHtml(summary);
  const outPath = path.resolve(path.dirname(inputPath), 'e2e-dashboard.html');
  fs.writeFileSync(outPath, html);
  console.log(`Dashboard written to ${outPath}`);
  if (summary.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = { summarize, renderHtml };
