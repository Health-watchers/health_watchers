#!/usr/bin/env node
// Enforces performance SLA thresholds against a k6 JSON summary and prints
// basic optimization suggestions when a bottleneck is detected.
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const p95Max = Number(args['p95-max-ms']);
const errorRateMax = Number(args['error-rate-max']);

const summary = JSON.parse(fs.readFileSync(args.results, 'utf8'));
const p95 = summary.metrics?.http_req_duration?.values?.['p(95)'] ?? 0;
const errorRate = summary.metrics?.http_req_failed?.values?.rate ?? 0;
const waitingTime = summary.metrics?.http_req_waiting?.values?.avg ?? 0;
const connectingTime = summary.metrics?.http_req_connecting?.values?.avg ?? 0;

let failed = false;

if (p95 > p95Max) {
  console.error(`SLA VIOLATION: p95 latency ${p95}ms exceeds max ${p95Max}ms`);
  failed = true;
  if (waitingTime > p95Max * 0.6) {
    console.log('Suggestion: server-side processing dominates latency — profile the API handler and database queries.');
  }
  if (connectingTime > 20) {
    console.log('Suggestion: high connection time — check connection pooling / keep-alive settings.');
  }
}

if (errorRate > errorRateMax) {
  console.error(`SLA VIOLATION: error rate ${errorRate} exceeds max ${errorRateMax}`);
  console.log('Suggestion: inspect logs for 5xx errors and add circuit breakers or rate limiting.');
  failed = true;
}

if (!failed) {
  console.log(`SLA satisfied: p95=${p95}ms (max ${p95Max}ms), error rate=${errorRate} (max ${errorRateMax})`);
}

process.exit(failed ? 1 : 0);
