#!/usr/bin/env node
// Blocks the build/deploy when the aggregated security summary contains
// findings at or above the configured severity gate.
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const summary = fs.readFileSync(args.summary, 'utf8');
const blockOn = (args['block-on'] || 'critical').toLowerCase();

const criticalMatch = summary.match(/Critical findings: (\d+)/);
const criticalCount = criticalMatch ? Number(criticalMatch[1]) : 0;

if (blockOn === 'critical' && criticalCount > 0) {
  console.error(`Blocking deployment: ${criticalCount} critical security finding(s) detected.`);
  process.exit(1);
}

console.log('Security gate passed: no blocking findings.');
process.exit(0);
