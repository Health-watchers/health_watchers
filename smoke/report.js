#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SMOKE_DIR = __dirname;
const REPORTS_DIR = path.join(SMOKE_DIR, 'reports');

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeWeb(json) {
  if (!json) return null;
  const entries = Array.isArray(json) ? json : json.entries;
  if (!entries && json.results) return json;
  const results = (entries ?? []).map((entry) => {
    const r = entry.results && entry.results.length ? entry.results[entry.results.length - 1] : {};
    return {
      title: entry.fullTitle || entry.title,
      project: entry.projectName,
      status: r.status,
      duration: typeof r.duration === 'number' ? Math.round(r.duration / 1000) * 1000 : r.duration,
    };
  });
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed' || r.status === 'timedOut').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const durationMs = results.reduce(
    (sum, r) => sum + (typeof r.duration === 'number' ? r.duration : 0),
    0
  );
  return { results, passed, failed, skipped, durationMs };
}

function durationLabel(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function buildDashboardHtml(api, web, budgetMs) {
  const apiRows = (api?.results ?? [])
    .map(
      (r) => `<tr class="${r.passed ? 'pass' : 'fail'}">
        <td>${r.checkName}</td>
        <td>${r.passed ? '✅ Pass' : r.skipped ? '⏭️ Skipped' : '❌ Fail'}</td>
        <td>${r.duration != null ? durationLabel(r.duration) : '—'}</td>
        <td>${r.render || r.reason || ''}</td>
      </tr>`
    )
    .join('');

  const webRows = (web?.results ?? [])
    .map(
      (r) => `<tr class="${r.status === 'passed' ? 'pass' : 'fail'}">
        <td>${r.title}</td>
        <td>${r.status}</td>
        <td>${r.duration != null ? durationLabel(r.duration) : '—'}</td>
        <td>${r.project || ''}</td>
      </tr>`
    )
    .join('');

  const totalDuration = (api?.durationMs ?? 0) + (web?.durationMs ?? 0);
  const budgetOk = budgetMs ? totalDuration <= budgetMs : true;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Health Watchers — Smoke Test Dashboard</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
  h1 { font-size: 20px; }
  h2 { font-size: 16px; margin-top: 28px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
  .card { background: #1e293b; border-radius: 8px; padding: 14px 18px; min-width: 130px; }
  .card .v { font-size: 26px; font-weight: 700; }
  .card .k { font-size: 12px; color: #94a3b8; text-transform: uppercase; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #334155; font-size: 13px; }
  th { color: #94a3b8; font-size: 11px; text-transform: uppercase; }
  .pass { color: #4ade80; }
  .fail { color: #f87171; }
  .warn { color: #fbbf24; }
  .hidden { display: none; }
</style>
</head>
<body>
  <h1>🧪 Health Watchers — Smoke Test Dashboard</h1>
  <p class="${budgetOk ? 'pass' : 'fail'}">Total duration: ${durationLabel(totalDuration)} ${budgetOk ? '✅ within budget' : '❌ over budget'}</p>
  <div class="cards">
    <div class="card"><div class="v">${api?.passed ?? 0}</div><div class="k">API passed</div></div>
    <div class="card"><div class="v">${api?.failed ?? 0}</div><div class="k">API failed</div></div>
    <div class="card"><div class="v">${web?.passed ?? 0}</div><div class="k">Web passed</div></div>
    <div class="card"><div class="v">${web?.failed ?? 0}</div><div class="k">Web failed</div></div>
  </div>
  <h2>API checks (${api?.finishedAt ?? 'n/a'})</h2>
  <table><thead><tr><th>Check</th><th>Status</th><th>Duration</th><th>Detail</th></tr></thead><tbody>${apiRows || '<tr><td colspan="4">No API results</td></tr>'}</tbody></table>
  <h2>Web flows</h2>
  <table><thead><tr><th>Flow</th><th>Status</th><th>Duration</th><th>Project</th></tr></thead><tbody>${webRows || '<tr><td colspan="4">No web results</td></tr>'}</tbody></table>
</body>
</html>`;
}

function main() {
  const api = loadJson(path.join(REPORTS_DIR, 'api-smoke-results.json'));
  const web = normalizeWeb(loadJson(path.join(REPORTS_DIR, 'web-smoke-results.json')));
  const budgetMs = Number(process.env.SMOKE_BUDGET_MS || 300000);

  const totalDuration = (api?.durationMs ?? 0) + (web?.durationMs ?? 0);
  const withinBudget = !budgetMs || totalDuration <= budgetMs;
  const allPassed = (api?.failed ?? 0) === 0 && (web?.failed ?? 0) === 0 && withinBudget;

  const md = [
    '## 🧪 Smoke Test Results',
    '',
    `| Suite | Passed | Failed | Skipped | Duration |`,
    `|---|---:|---:|---:|---:|`,
    `| API | ${api?.passed ?? 0} | ${api?.failed ?? 0} | ${api?.skipped ?? 0} | ${api ? durationLabel(api.durationMs) : 'n/a'} |`,
    `| Web | ${web?.passed ?? 0} | ${web?.failed ?? 0} | ${web?.skipped ?? 0} | ${web ? durationLabel(web.durationMs) : 'n/a'} |`,
    '',
    `**Budget:** ${durationLabel(budgetMs)} — ${withinBudget ? '✅ met' : '❌ exceeded'}`,
    '',
  ].join('\n');

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, 'smoke-report.md'), md);
  fs.writeFileSync(
    path.join(REPORTS_DIR, 'smoke-dashboard.html'),
    buildDashboardHtml(api, web, budgetMs)
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    api,
    web,
    totalDurationMs: totalDuration,
    withinBudget,
    allPassed,
  };
  fs.writeFileSync(path.join(REPORTS_DIR, 'smoke-report.json'), JSON.stringify(summary, null, 2));

  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    } catch {
      // best effort when the summary file is unavailable
    }
  }
  if (!withinBudget) console.error('Smoke budget exceeded');
  if (!allPassed) process.exitCode = 1;
}

main();
