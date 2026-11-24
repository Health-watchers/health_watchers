#!/usr/bin/env node
/**
 * Visual Regression Metrics Tracker
 * =====================================
 * Parses the Playwright JSON results from a visual regression run and produces
 * a structured metrics report, including:
 *
 *   - Per-test pass/fail/skip status
 *   - Pixel diff counts and percentages
 *   - Project-level summaries
 *   - Historical trend tracking (appends to metrics-history.json)
 *
 * Usage:
 *   node scripts/visual-metrics.mjs
 *   node scripts/visual-metrics.mjs --output my-report.json
 *   node scripts/visual-metrics.mjs --no-history    # skip history file
 *   node scripts/visual-metrics.mjs --print         # print summary to stdout
 *
 * Output files (relative to apps/web/):
 *   playwright-visual-report/visual-metrics.json   — latest run metrics
 *   playwright-visual-report/metrics-history.json  — historical data for trend analysis
 *
 * The JSON output can be consumed by:
 *   - GitHub Actions job summaries (see .github/workflows/visual-regression.yml)
 *   - Grafana dashboards or any JSON-compatible monitoring tool
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(WEB_DIR, 'playwright-visual-report');
const RESULTS_JSON = path.join(REPORT_DIR, 'results.json');
const METRICS_OUTPUT = path.join(REPORT_DIR, 'visual-metrics.json');
const HISTORY_FILE = path.join(REPORT_DIR, 'metrics-history.json');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const opts = {
  output: args.find((a, i) => args[i - 1] === '--output') ?? METRICS_OUTPUT,
  history: !args.includes('--no-history'),
  print: args.includes('--print'),
};

// ---------------------------------------------------------------------------
// Load results
// ---------------------------------------------------------------------------

if (!fs.existsSync(RESULTS_JSON)) {
  console.error('❌ No results.json found. Run the visual regression suite first:');
  console.error('    npx playwright test --config=playwright.visual.config.ts');
  process.exit(1);
}

/** @type {any} */
const results = JSON.parse(fs.readFileSync(RESULTS_JSON, 'utf8'));

// ---------------------------------------------------------------------------
// Parse test results
// ---------------------------------------------------------------------------

/**
 * Walk the Playwright result tree and collect per-test metrics.
 * Playwright encodes pixel diff data in attachment names and the error message.
 *
 * @returns {import('./visual-metrics.mjs').VisualTestResult[]}
 */
function extractTestMetrics(root) {
  /** @type {any[]} */
  const tests = [];

  function walk(suite, projectName) {
    const project = suite.project ?? projectName;

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const result = test.results?.[0] ?? {};
        const duration = result.duration ?? 0;
        const status = normaliseStatus(test.status);

        // Try to extract pixel diff from error message
        // Playwright reports: "... x pixels (y%) ..."
        let diffPixels = null;
        let diffRatio = null;
        const errorMsg = result.errors?.[0]?.message ?? '';
        const pixelMatch = errorMsg.match(/(\d[\d,]*)\s+pixel/);
        const ratioMatch = errorMsg.match(/\((\d+\.?\d*)%\)/);
        if (pixelMatch) diffPixels = parseInt(pixelMatch[1].replace(/,/g, ''), 10);
        if (ratioMatch) diffRatio = parseFloat(ratioMatch[1]) / 100;

        // Collect attachment paths
        const snapshotAttachment = result.attachments?.find((a) =>
          a.name === 'screenshot' || a.name?.includes('-expected'),
        );
        const diffAttachment = result.attachments?.find((a) => a.name?.includes('-diff'));

        tests.push({
          test: spec.title,
          project: project ?? 'unknown',
          status,
          diffPixels,
          diffRatio,
          snapshotPath: snapshotAttachment?.path ?? null,
          diffPath: diffAttachment?.path ?? null,
          durationMs: duration,
        });
      }
    }

    for (const child of suite.suites ?? []) walk(child, project);
  }

  walk(root);
  return tests;
}

function normaliseStatus(status) {
  if (status === 'expected' || status === 'passed') return 'passed';
  if (status === 'unexpected' || status === 'failed') return 'failed';
  return 'skipped';
}

// ---------------------------------------------------------------------------
// Build metrics report
// ---------------------------------------------------------------------------

const testResults = extractTestMetrics(results);

/** @type {Map<string, { passed: number; failed: number; skipped: number }>} */
const projectSummary = new Map();
for (const t of testResults) {
  if (!projectSummary.has(t.project)) {
    projectSummary.set(t.project, { passed: 0, failed: 0, skipped: 0 });
  }
  projectSummary.get(t.project)[t.status]++;
}

const totalPassed = testResults.filter((t) => t.status === 'passed').length;
const totalFailed = testResults.filter((t) => t.status === 'failed').length;
const totalSkipped = testResults.filter((t) => t.status === 'skipped').length;
const totalTests = testResults.length;

// Worst offender by pixel count
const worstDiffs = [...testResults]
  .filter((t) => t.diffPixels !== null)
  .sort((a, b) => (b.diffPixels ?? 0) - (a.diffPixels ?? 0))
  .slice(0, 10);

const metrics = {
  generatedAt: new Date().toISOString(),
  runId: process.env.GITHUB_RUN_ID ?? null,
  sha: process.env.GITHUB_SHA ?? null,
  branch: process.env.GITHUB_REF_NAME ?? null,
  totalTests,
  passed: totalPassed,
  failed: totalFailed,
  skipped: totalSkipped,
  passRate: totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) + '%' : 'N/A',
  projectSummary: Object.fromEntries(projectSummary),
  worstDiffs,
  results: testResults,
};

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

fs.mkdirSync(path.dirname(opts.output), { recursive: true });
fs.writeFileSync(opts.output, JSON.stringify(metrics, null, 2));
console.log(`✅ Visual metrics written to: ${path.relative(WEB_DIR, opts.output)}`);

// ---------------------------------------------------------------------------
// Update history
// ---------------------------------------------------------------------------

if (opts.history) {
  /** @type {any[]} */
  let history = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { /* ok */ }
  }

  // Append compact summary for trending
  history.push({
    generatedAt: metrics.generatedAt,
    runId: metrics.runId,
    sha: metrics.sha,
    branch: metrics.branch,
    totalTests,
    passed: totalPassed,
    failed: totalFailed,
    skipped: totalSkipped,
  });

  // Keep last 100 runs
  if (history.length > 100) history = history.slice(-100);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  console.log(`📈 History updated: ${path.relative(WEB_DIR, HISTORY_FILE)} (${history.length} entries)`);
}

// ---------------------------------------------------------------------------
// Print summary
// ---------------------------------------------------------------------------

if (opts.print || totalFailed > 0) {
  console.log('\n─────────────────────────────────────────────');
  console.log('  Visual Regression Metrics Summary');
  console.log('─────────────────────────────────────────────');
  console.log(`  Pass rate : ${metrics.passRate}`);
  console.log(`  Passed    : ${totalPassed} / ${totalTests}`);
  console.log(`  Failed    : ${totalFailed}`);
  console.log(`  Skipped   : ${totalSkipped}`);

  if (projectSummary.size > 0) {
    console.log('\n  By project:');
    for (const [proj, counts] of projectSummary) {
      const icon = counts.failed > 0 ? '❌' : '✅';
      console.log(`    ${icon} ${proj.padEnd(30)} passed=${counts.passed} failed=${counts.failed}`);
    }
  }

  if (worstDiffs.length > 0) {
    console.log('\n  Top pixel differences:');
    for (const d of worstDiffs) {
      const ratio = d.diffRatio !== null ? ` (${(d.diffRatio * 100).toFixed(2)}%)` : '';
      console.log(`    ${d.diffPixels?.toLocaleString()} px${ratio} — ${d.test} [${d.project}]`);
    }
  }

  console.log('─────────────────────────────────────────────\n');
}

// Exit with error code if any tests failed (so CI can detect failures)
if (totalFailed > 0) {
  process.exit(1);
}
