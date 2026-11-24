#!/usr/bin/env node
'use strict';

// Produces the performance reporting artifacts (issue #1319):
//   - performance/reports/performance-dashboard.html  (shareable dashboard)
//   - performance/reports/performance-report.md       (summary for CI)
//   - performance/reports/performance-report.json     (machine readable)
//
// Combines k6 summary, resource samples, historical runs and recommendations;
// also performs the regression gate used by CI (exit code 1 on breach).

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
function read(rel, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, rel), 'utf8'));
  } catch {
    return fallback;
  }
}

function ms(n) {
  return `${Math.round(n)}ms`;
}

function pct(n) {
  return `${(n * 100).toFixed(2)}%`;
}

function buildDashboard(report) {
  const totals = report.totals;
  const headers = 'Endpoint | Status | p50 | p90 | p95 | p99 | Baseline | Limit | Trend';
  const sep = '--- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---';

  const rows = [];
  for (const [key, e] of Object.entries(report.endpoints)) {
    const trend = e.changePct == null ? '—' : `${e.changePct >= 0 ? '+' : ''}${e.changePct}%`;
    rows.push(
      `**${e.name}** | ${e.withinBudget ? '✅' : '❌'} | ${ms(e.p50)} | ${ms(e.p90)} | ${ms(e.p95)} | ${ms(e.p99)} | ${ms(e.baseline)} | ${ms(e.limit)} | ${trend}`
    );
  }

  const recRows = (report.recommendations.endpoints || [])
    .filter((d) => d.recommendations.length)
    .map(
      (d) =>
        `**${d.name}** (p95 ${ms(d.p95)}, budget ${d.withinBudget ? 'ok' : 'breach'})\n` +
        d.recommendations.map((r) => `- ${r.text}`).join('\n')
    )
    .join('\n');

  const resource = report.resources
    ? `- **API CPU:** avg ${report.resources.avgCpuPct.toFixed(1)}% / max ${report.resources.maxCpuPct.toFixed(1)}%\n- **API memory:** avg ${(report.resources.avgMemBytes / 1e6).toFixed(1)} MB / max ${(report.resources.maxMemBytes / 1e6).toFixed(1)} MB`
    : '- Resource sampling unavailable.';

  return [
    '# 📈 Performance Benchmark Report',
    '',
    `_${report.generatedAt} · branch \`${report.meta.branch}\` · commit \`${report.meta.commit}\` · mode \`${report.meta.mode}\`_`,
    '',
    '## Totals',
    '',
    `- **Requests:** ${totals.totalRequests} · **Throughput:** ${totals.throughputPerSec.toFixed(1)} req/s`,
    `- **Error rate:** ${pct(totals.errorRate)} · **Duration:** ${Math.round(totals.durationSec)}s`,
    `- **Overall:** ${totals.allWithinBudget ? '✅ all endpoints within budget' : '❌ regressions detected'}`,
    '',
    '## Per-endpoint',
    '',
    `| ${headers} |`,
    `| ${sep} |`,
    rows.length ? rows.join('\n') : '_no endpoint metrics recorded_',
    '',
    '## Resource utilization',
    '',
    resource,
    '',
    '## Recommendations',
    '',
    recRows || '_no recommended actions_',
    '',
    '## Recent history (last 5 runs)',
    '',
    '| Run | Branch @ commit | Endpoints within budget | Error rate |',
    '|---|---|---:|---:|',
    report.history
      .slice(-5)
      .reverse()
      .map(
        (r) =>
          `| ${r.timestamp.slice(0, 10)} | ${r.branch}@${r.commit} | ${r.withinBudgetCount} / ${r.endpointCount} | ${pct(r.errorRate)} |`
      )
      .join('\n') || '_no history yet_',
    '',
  ].join('\n');
}

function main() {
  const summary = read('results/summary.json', { metrics: {} });
  const resources = read('results/resources.json', null);
  const baselines = read('baselines/baselines.json', {
    baselines: {},
    regression_threshold_percent: 20,
  });
  const history = read('history/metrics-history.json', { runs: [] });
  const recommendations = read('reports/recommendations.json', { endpoints: [] });

  const threshold = baselines.regression_threshold_percent / 100;
  const prevRun = history.runs.length ? history.runs[history.runs.length - 1] : null;

  const endpoints = {};
  for (const [name, base] of Object.entries(baselines.baselines || {})) {
    const metric = summary.metrics?.[name];
    const values = metric?.values;
    if (!values) continue;
    const p95 = values['p(95)'];
    const p50 = values['p(50)'];
    const p90 = values['p(90)'];
    const p99 = values['p(99)'];
    const limit = base * (1 + threshold);
    const requestsCounter = summary.metrics?.[`${name.replace(/_duration$/, '')}_requests`];
    let changePct = null;
    if (prevRun?.endpoints?.[name]?.p95 != null && typeof p95 === 'number') {
      changePct = Math.round(
        ((p95 - prevRun.endpoints[name].p95) / prevRun.endpoints[name].p95) * 100
      );
    }
    endpoints[name] = {
      name: name.replace(/_duration$/, '').replace(/_/g, ' '),
      p50: p50 || 0,
      p90: p90 || 0,
      p95: p95 || 0,
      p99: p99 || 0,
      baseline: base,
      limit: Math.round(limit),
      withinBudget: typeof p95 === 'number' ? p95 <= limit : true,
      throughputPerSec: Number(requestsCounter?.values?.rate || 0),
      changePct,
    };
  }

  const withinBudgetCount = Object.values(endpoints).filter((e) => e.withinBudget).length;
  const anyBreach = Object.values(endpoints).some((e) => !e.withinBudget);

  const totals = {
    totalRequests: Math.round(summary.metrics?.http_reqs?.values?.count || 0),
    throughputPerSec: Number(summary.metrics?.http_reqs?.values?.rate || 0),
    errorRate: Number(summary.metrics?.http_req_failed?.values?.rate || 0),
    durationSec: Math.round(summary.metrics?.iteration_duration?.values?.max || 0),
    withinBudgetCount,
    endpointCount: Object.keys(endpoints).length,
    allWithinBudget:
      withinBudgetCount === Object.keys(endpoints).length &&
      !anyBreach &&
      Object.keys(endpoints).length > 0,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    meta: {
      branch: process.env.GITHUB_REF_NAME || 'local',
      commit: process.env.GITHUB_SHA || 'local',
      environment: process.env.PERF_ENV || 'ci',
      mode: process.env.PERF_MODE || 'light',
      baselineVersion: baselines.version,
    },
    totals,
    endpoints,
    resources: resources
      ? {
          avgCpuPct: resources.avgCpuPct,
          maxCpuPct: resources.maxCpuPct,
          avgMemBytes: resources.avgMemBytes,
          maxMemBytes: resources.maxMemBytes,
        }
      : null,
    recommendations,
    history: (history.runs || []).map((r) => {
      let within = 0;
      let total = 0;
      for (const [key, e] of Object.entries(r.endpoints || {})) {
        const base = baselines.baselines[`${key}_duration`];
        total += 1;
        if (
          typeof base === 'number' &&
          typeof e.p95 === 'number' &&
          e.p95 <= base * (1 + threshold)
        )
          within += 1;
      }
      return {
        timestamp: r.timestamp,
        branch: r.branch,
        commit: r.commit,
        errorRate: r.errorRate,
        endpointCount: total,
        withinBudgetCount: within,
      };
    }),
  };

  fs.mkdirSync(path.join(DIR, 'reports'), { recursive: true });
  const dashboard = buildDashboard(report);
  fs.writeFileSync(path.join(DIR, 'reports', 'performance-report.md'), dashboard);
  fs.writeFileSync(
    path.join(DIR, 'reports', 'performance-report.json'),
    JSON.stringify(report, null, 2)
  );

  const kpi = (label, value, ok) =>
    `<div class="card"><div class="v ${ok === undefined ? '' : ok ? 'good' : 'bad'}">${value}</div><div class="k">${label}</div></div>`;
  const htmlContent = dashboard
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^\*\*(.*)\*\*$/gm, '<p><strong>$1</strong></p>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>\n');

  fs.writeFileSync(
    path.join(DIR, 'reports', 'performance-dashboard.html'),
    `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Health Watchers — Performance Dashboard</title>
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
${kpi('Requests', totals.totalRequests)}
${kpi('Throughput', `${totals.throughputPerSec.toFixed(1)} req/s`)}
${kpi('Error rate', `${(totals.errorRate * 100).toFixed(2)}%`, totals.errorRate <= 0.01)}
${kpi('Endpoints in budget', `${totals.withinBudgetCount} / ${totals.endpointCount}`, totals.allWithinBudget)}
</div>
<pre>${htmlContent}</pre>
</body></html>`
  );

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, dashboard);
    } catch {}
  }

  console.log(
    `report: ${Object.keys(endpoints).length} endpoints analysed; ${totals.allWithinBudget ? 'all within budget' : 'REGRESSION DETECTED'}`
  );

  // Regression gate used by CI: fail when any endpoint breaches its limit,
  // or when error rate is above 2%.
  const errorBreach = totals.errorRate > 0.02;
  if (anyBreach || errorBreach || Object.keys(endpoints).length === 0) {
    console.error('performance gate: FAILED');
    process.exitCode = 1;
  }
}

main();
