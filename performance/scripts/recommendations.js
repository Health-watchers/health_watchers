#!/usr/bin/env node
'use strict';

// Turns benchmark results + resource sampling into actionable, concrete
// recommendations (issue #1319 — "performance improvement recommendations").
//
// Reads:
//   - performance/results/summary.json      (k6 --summary-export output)
//   - performance/results/resources.json    (capture-resources.js output)
//   - performance/baselines/baselines.json  (regression thresholds)
//   - performance/history/metrics-history.json (trend context)
//
// Writes performance/reports/recommendations.json and appends the Markdown
// rendering to performance/reports/recommendations.md.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const RESULTS = path.join(DIR, 'results');
const REPORTS = path.join(DIR, 'reports');
const BASELINES_FILE = path.join(DIR, 'baselines', 'baselines.json');
const HISTORY_FILE = path.join(DIR, 'history', 'metrics-history.json');

function read(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const OBSERVATIONS_CATALOG = {
  patchedMongoIndex: (ep) =>
    `Add or re-check the MongoDB compound index backing the ${ep} query (e.g. on clinicId + isActive + createdAt) — full-collection scans commonly show up as p90/p95 tail latency.`,
  cache: (ep) =>
    `Introduce a read-through cache (e.g. Redis) for ${ep}; if data is immutable for long periods, a storefront-style cache will flatten the p95 tail.`,
  connectionPool: (ep) =>
    `The ${ep} path is hitting the DB on every request at this load. Bump the default connection pool / maxPoolSize, or route reads to a secondary.`,
  compression: (ep) =>
    `Enable response compression for ${ep}; large JSON payloads on the wire inflate network latency and CPU.`,
  pagination: (ep) =>
    `Confirm ${ep} is fully paginated and clients are not fetching unbounded result sets; log the top-N slow queries from MongoDB to confirm.`,
  apm: (ep) =>
    `Instrument ${ep} with the existing Jaeger/OTel tracing and open the slowest spans — profile the actual hotspot before indexing blindly.`,
  autoscale: (ep) =>
    `At this load the API is CPU-saturated. Scale horizontally (HPA on CPU%/RPS) or vertically before blaming a single endpoint — ${ep} is a symptom, not the cause.`,
  increaseLimits: (ep) =>
    `Raise k8s resource limits/requests for the API pod; memory is nearing the configured ceiling for ${ep}.`,
  gracefulDegradation: (ep) =>
    `Add circuit-breaker / graceful-degradation behaviour for ${ep} so the error rate doesn't couple to upstream latency.`,
  rateLimits: (ep) =>
    `Errors on ${ep} look like client abuse or unauth'd load — verify rate-limiter tuning (the API already ships Express rate-limiters per route).`,
  healthy: (ep) =>
    `${ep} is within budget and errors are nominal — no action needed. Keep an eye on trend over nightlies.`,
  watch: (ep) =>
    `${ep} p95 is climbing toward its threshold. Add it to nightly trend alerting and re-baseline after the next healthy deploy.`,
};

function matchEndpoint(baseLineKey) {
  return baseLineKey.replace(/_duration$/, '').replace(/_/g, ' ');
}

function recommendationsFor(metricName, current, baseline, limit, resource, prevLatest) {
  const out = [];
  const ep = matchEndpoint(metricName);
  const action = (id) => out.push({ id, narrow: true });

  if (typeof current !== 'number' || typeof baseline !== 'number') return out;

  const marginPct = ((current - baseline) / baseline) * 100;

  if (current > limit) {
    action('patchedMongoIndex');
    action('cache');
    if (resource && resource.avgCpuPct > 70) action('autoscale');
    if (resource && resource.maxMemBytes > (resource.memLimitBytes || 0) * 0.8)
      action('increaseLimits');
    if (prevLatest && prevLatest[metricName] && current > prevLatest[metricName] * 1.5) {
      action('apm');
      action('connectionPool');
    }
    return out;
  }

  if (current > baseline) {
    action('compression');
    action('pagination');
    // Widening but not yet failing — flag for trend watch rather than alarm.
    out.push({ id: 'watch', narrow: false });
    return out;
  }

  if (resource && resource.avgCpuPct > 70) {
    action('autoscale');
    return out;
  }

  action('healthy');
  return out;
}

function main() {
  const summary = read(path.join(RESULTS, 'summary.json'), { metrics: {} });
  const resource = read(path.join(RESULTS, 'resources.json'), null);
  const baselines = read(BASELINES_FILE, { baselines: {}, regression_threshold_percent: 20 });
  const history = read(HISTORY_FILE, { runs: [] });

  const threshold = baselines.regression_threshold_percent / 100;
  const previous = history.runs.length ? history.runs[history.runs.length - 1] : null;
  const prevMetrics = {};
  if (previous) {
    for (const [k, v] of Object.entries(previous.endpoints || {})) {
      if (typeof v.p95 === 'number') prevMetrics[`${k}_duration`] = v.p95;
    }
  }

  const details = [];
  for (const [name, base] of Object.entries(baselines.baselines || {})) {
    const metric = summary.metrics?.[name];
    const current = metric?.values?.['p(95)'];
    if (typeof current !== 'number') continue;
    const limit = base * (1 + threshold);
    const ep = matchEndpoint(name);
    const tags = recommendationsFor(name, current, base, limit, resource, prevMetrics);
    details.push({
      endpoint: name,
      name: ep,
      p95: Math.round(current),
      baseline: base,
      limit: Math.round(limit),
      withinBudget: current <= limit,
      marginPct: Math.round(((current - base) / base) * 100),
      recommendations: tags.map((t) => ({ ...t, text: OBSERVATIONS_CATALOG[t.id]?.(ep) || t.id })),
    });
  }

  const errorRate = Number(summary.metrics?.http_req_failed?.values?.rate || 0);
  const totalRequests = Math.round(summary.metrics?.http_reqs?.values?.count || 0);
  const global = [];
  if (errorRate > 0.02) {
    global.push({
      text: 'Overall error rate is above 2% — inspect 5xx sources and apply gracefulDegradation + rateLimits before blaming latency.',
      severity: 'high',
    });
  }
  if (errorRate > 0.01 && errorRate <= 0.02) {
    global.push({
      text: 'Error rate between 1-2% — watch trending alerts; verify rate-limiter thresholds and retryable failures.',
      severity: 'medium',
    });
  }
  if (resource && resource.avgCpuPct > 70) {
    global.push({
      text: `API sustained ${resource.avgCpuPct.toFixed(0)}% average CPU — schedule HPA on CPU%, co-locate heavy endpoints with paginated reads.`,
      severity: 'high',
    });
  }
  if (resource && resource.maxMemBytes > 0 && resource.avgMemBytes > 0.75 * resource.maxMemBytes) {
    global.push({
      text: `API memory averaged >75% of observed peak — consider increasing limits or investigating a slow leak.`,
      severity: 'medium',
    });
  }
  if (totalRequests > 0 && summary.metrics?.http_reqs?.values?.rate) {
    global.push({
      text: `Suite sustained ${Number(summary.metrics.http_reqs.values.rate).toFixed(1)} req/s across ${totalRequests} requests.`,
      severity: 'info',
    });
  }

  const recommendations = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalRequests,
      errorRate,
      throughputPerSec: Number(summary.metrics?.http_reqs?.values?.rate || 0),
      endpointResults: details.length,
    },
    global,
    endpoints: details,
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS, 'recommendations.json'),
    JSON.stringify(recommendations, null, 2)
  );

  const md = [
    '## 🚀 Performance Recommendations',
    '',
    `- **Requests:** ${totalRequests} · **Throughput:** ${recommendations.summary.throughputPerSec.toFixed(1)} req/s · **Error rate:** ${(errorRate * 100).toFixed(2)}%`,
    '',
  ];
  for (const g of global) {
    md.push(`**${g.severity.toUpperCase()}** — ${g.text}`);
  }
  md.push('', '### Per-endpoint', '');
  for (const d of details) {
    const status = d.withinBudget ? '✅ within budget' : '❌ BREACH';
    md.push(
      `**${d.name}** p95 ${d.p95}ms (baseline ${d.baseline}ms, limit ${d.limit}ms) — ${status}`
    );
    for (const r of d.recommendations) {
      md.push(`- ${r.text}`);
    }
  }
  md.push('', `_Recommendations generated ${recommendations.generatedAt}._`);
  fs.writeFileSync(path.join(REPORTS, 'recommendations.md'), md.join('\n'));

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n'));
    } catch {}
  }
  console.log(
    `recommendations: ${details.length} endpoints analysed, ${global.length} global findings`
  );
}

main();
