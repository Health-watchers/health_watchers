#!/usr/bin/env node
'use strict';

// Quality trend tracking (issue #1320 — "quality trend tracking").
// Appends the latest quality snapshot to scripts/quality/history/trend.json
// so the team can measure improvement over time.
//
// Usage: node scripts/quality/record-trend.js
// HISTORY_MAX=90 to bound history size.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const HISTORY = path.join(DIR, 'history', 'trend.json');
const MAX = Number(process.env.HISTORY_MAX || 90);

function main() {
  const score = JSON.parse(fs.readFileSync(path.join(DIR, 'reports', 'score.json'), 'utf8'));

  const entry = {
    timestamp: new Date().toISOString(),
    branch: process.env.GITHUB_REF_NAME || 'local',
    commit: (process.env.GITHUB_SHA || 'local').slice(0, 12),
    overall: score.overall,
    passed: score.passed,
    maintainabilityIndex: score.gates.maintainabilityIndex,
    coveragePercent: score.gates.coveragePercent,
    duplicatePercent: score.gates.duplicatePercent,
    avgFunctionComplexity: score.gates.avgFunctionComplexity,
    highRiskFunctions: score.gates.highRiskFunctions,
  };

  let history = { runs: [] };
  try {
    history = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
  } catch {}
  // Avoid dupes for the same commit on a given day.
  const isDup = history.runs.some(
    (r) => r.commit === entry.commit && r.timestamp.slice(0, 10) === entry.timestamp.slice(0, 10)
  );
  if (!isDup) history.runs.push(entry);
  history.runs = history.runs.slice(-MAX);

  fs.mkdirSync(path.dirname(HISTORY), { recursive: true });
  fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2) + '\n');
  console.log(
    `trend: recorded ${entry.overall}/100 (${entry.branch}@${entry.commit}) — ${history.runs.length} runs in history`
  );
}

main();
