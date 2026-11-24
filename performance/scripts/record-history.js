#!/usr/bin/env node
'use strict';

// Records each benchmark run into performance/history/metrics-history.json so
// performance can be tracked over time and compared against previous runs
// (issue #1319 — "metrics tracked historically").
//
// Usage:
//   HISTORY_MAX=30 node performance/scripts/record-history.js \
//     --summary performance/results/summary.json \
//     --branch main --commit abc1234 --environment ci
//
// Writes the updated history file in place.

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : fallback;
}

const HISTORY_FILE = path.join(__dirname, '..', 'history', 'metrics-history.json');
const MAX_RUNS = Number(process.env.HISTORY_MAX || 60);

function load() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return { runs: [] };
  }
}

function main() {
  const summaryPath = arg('summary', 'performance/results/summary.json');
  const summary = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', '..', summaryPath), 'utf8')
  );

  const branch = arg('branch', process.env.GITHUB_REF_NAME || 'local');
  const commit = arg('commit', process.env.GITHUB_SHA || 'local');
  const environment = arg('environment', 'ci');

  const endpoints = {};
  for (const [name, metric] of Object.entries(summary.metrics || {})) {
    if (/duration$/.test(name) && metric.metric_type === 'trend' && metric.values) {
      endpoints[name] = {
        p95: metric.values['p(95)'],
        p99: metric.values['p(99)'],
        p90: metric.values['p(90)'],
        p50: metric.values['p(50)'],
        avg: metric.values.avg,
        count: metric.values.count,
      };
    } else if (name.endsWith('_requests') && metric.metric_type === 'counter' && metric.values) {
      const endpoint = name.replace(/_requests$/, '');
      if (!endpoints[endpoint]) endpoints[endpoint] = {};
      endpoints[endpoint].throughputPerSec = Number(metric.values.rate || 0);
    }
  }

  const globalMetrics = summary.metrics || {};
  const run = {
    timestamp: new Date().toISOString(),
    branch,
    commit: String(commit).slice(0, 12),
    environment,
    totalRequests: Math.round(globalMetrics.http_reqs?.values?.count || 0),
    throughputPerSec: Number(globalMetrics.http_reqs?.values?.rate || 0),
    errorRate: Number(globalMetrics.http_req_failed?.values?.rate || 0),
    durationSec: Math.round(globalMetrics.iteration_duration?.values?.max || 0),
    endpoints,
  };

  const history = load();
  history.runs.push(run);

  // Keep the newest MAX_RUNS entries.
  history.runs = history.runs.slice(-MAX_RUNS);

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2) + '\n');
  console.log(
    `recorded run for ${branch}@${run.commit}: ${run.totalRequests} requests, ` +
      `error rate ${(run.errorRate * 100).toFixed(2)}%, total history ${history.runs.length}`
  );
}

main();
