#!/usr/bin/env node
// Compares a k6 run's summary metrics against a stored baseline and fails
// if p95 latency regresses beyond the given threshold percentage.
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return args;
}

function readP95(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);
  return json.metrics?.http_req_duration?.values?.['p(95)'];
}

const args = parseArgs(process.argv.slice(2));
const thresholdPct = Number(args['threshold-pct'] || 10);

if (!fs.existsSync(args.baseline)) {
  console.log('No baseline found yet; skipping regression check.');
  process.exit(0);
}

const currentP95 = readP95(args.current);
const baselineP95 = readP95(args.baseline);

if (currentP95 == null || baselineP95 == null) {
  console.log('Missing p95 metric in results; skipping regression check.');
  process.exit(0);
}

const regressionPct = ((currentP95 - baselineP95) / baselineP95) * 100;

console.log(`Baseline p95: ${baselineP95.toFixed(2)}ms`);
console.log(`Current p95:  ${currentP95.toFixed(2)}ms`);
console.log(`Change:       ${regressionPct.toFixed(2)}%`);

if (regressionPct > thresholdPct) {
  console.error(
    `Performance regression detected: p95 latency increased by ${regressionPct.toFixed(2)}% (threshold: ${thresholdPct}%)`
  );
  process.exit(1);
}

console.log('No significant performance regression detected.');
